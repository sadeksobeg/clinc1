using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ClinicSaaS.Api.Services;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/platform")]
[Authorize(Policy = "PlatformOnly")]
public sealed class PlatformBillingController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly SubscriptionService _subscriptions;
    private readonly BillingService _billing;
    private readonly UsageService _usage;
    private readonly PlatformAuditService _audit;
    private readonly ReconciliationService _reconciliation;
    private readonly RevenueAnalyticsService _revenueAnalytics;
    private readonly InvoicePdfService _invoicePdf;
    private readonly DunningService _dunning;

    public PlatformBillingController(ClinicDbContext db, SubscriptionService subscriptions, BillingService billing, UsageService usage, PlatformAuditService audit, ReconciliationService reconciliation, RevenueAnalyticsService revenueAnalytics, InvoicePdfService invoicePdf, DunningService dunning)
    {
        _db = db;
        _subscriptions = subscriptions;
        _billing = billing;
        _usage = usage;
        _audit = audit;
        _reconciliation = reconciliation;
        _revenueAnalytics = revenueAnalytics;
        _invoicePdf = invoicePdf;
        _dunning = dunning;
    }

    [HttpGet("plans")]
    public async Task<ActionResult<IReadOnlyList<PlanDto>>> GetPlans(CancellationToken cancellationToken)
    {
        var plans = await _db.Plans.IgnoreQueryFilters().AsNoTracking()
            .OrderBy(x => x.PriceMonthly)
            .Select(x => new PlanDto(x.Id, x.Name, x.PriceMonthly, x.PriceYearly, x.Currency, x.FeaturesJson, x.MaxDoctors, x.MaxReceptionists, x.MaxAppointmentsPerMonth, x.MaxMessages, x.IsActive))
            .ToArrayAsync(cancellationToken);
        return Ok(plans);
    }

    [HttpPost("plans")]
    public async Task<ActionResult<PlanDto>> UpsertPlan([FromBody] UpsertPlanRequest body, CancellationToken cancellationToken)
    {
        var plan = body.Id.HasValue
            ? await _db.Plans.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == body.Id.Value, cancellationToken)
            : null;
        if (plan is null)
        {
            plan = new Plan { Id = Guid.NewGuid() };
            _db.Plans.Add(plan);
        }

        plan.Name = body.Name.Trim();
        plan.PriceMonthly = body.PriceMonthly;
        plan.PriceYearly = body.PriceYearly;
        plan.Currency = string.IsNullOrWhiteSpace(body.Currency) ? "USD" : body.Currency.Trim().ToUpperInvariant();
        plan.FeaturesJson = string.IsNullOrWhiteSpace(body.FeaturesJson) ? "{}" : body.FeaturesJson;
        plan.MaxDoctors = body.MaxDoctors;
        plan.MaxReceptionists = body.MaxReceptionists;
        plan.MaxAppointmentsPerMonth = body.MaxAppointmentsPerMonth;
        plan.MaxMessages = body.MaxMessages;
        plan.IsActive = body.IsActive;

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("PlanUpserted", GetActorId(), "Plan", plan.Id.ToString(), cancellationToken);

        return Ok(new PlanDto(plan.Id, plan.Name, plan.PriceMonthly, plan.PriceYearly, plan.Currency, plan.FeaturesJson, plan.MaxDoctors, plan.MaxReceptionists, plan.MaxAppointmentsPerMonth, plan.MaxMessages, plan.IsActive));
    }

    [HttpGet("subscriptions")]
    public async Task<ActionResult<IReadOnlyList<PlatformSubscriptionRowDto>>> GetSubscriptions(CancellationToken cancellationToken)
    {
        Response.Headers.Append("X-API-Deprecation", "Use /api/platform/v2/subscriptions for advanced billing insights.");
        var tenants = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);
        var plans = await _db.Plans.IgnoreQueryFilters().AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);
        var invoiceLookup = await _db.Invoices.IgnoreQueryFilters().AsNoTracking()
            .GroupBy(x => x.SubscriptionId)
            .Select(g => g.OrderByDescending(x => x.IssuedAtUtc).First())
            .ToDictionaryAsync(x => x.SubscriptionId, x => x, cancellationToken);
        var rows = await _db.Subscriptions.IgnoreQueryFilters().AsNoTracking()
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new { x.Id, x.TenantId, x.PlanId, x.Status, x.StartDate, x.EndDate, x.TrialEndsAt, x.IsTrial, x.AutoRenew, x.CreatedAt, x.PendingPlanId, x.DowngradeEffectiveAt })
            .ToArrayAsync(cancellationToken);
        var result = rows.Select(x =>
        {
            var invoice = invoiceLookup.GetValueOrDefault(x.Id);
            var clinicName = tenants.GetValueOrDefault(x.TenantId, x.TenantId.ToString());
            var planName = plans.GetValueOrDefault(x.PlanId, x.PlanId.ToString());
            var requestType = "renewal";
            return new PlatformSubscriptionRowDto(
                x.Id,
                x.TenantId,
                clinicName,
                "Tenant Admin",
                string.Empty,
                "SaaS",
                x.Status,
                planName,
                requestType,
                $"Current subscription on {planName}",
                invoice?.Amount ?? 0m,
                invoice?.PaymentMethod,
                invoice?.PaymentReference ?? string.Empty,
                x.CreatedAt,
                x.StartDate,
                x.EndDate,
                x.TrialEndsAt,
                x.IsTrial,
                x.AutoRenew,
                x.PendingPlanId,
                x.DowngradeEffectiveAt
            );
        }).ToArray();
        return Ok(result);
    }

    [HttpPost("subscriptions")]
    public async Task<ActionResult<PlatformSubscriptionRowDto>> CreateSubscriptionRequest([FromBody] CreatePlatformSubscriptionRequest body, CancellationToken cancellationToken)
    {
        var method = ParseMethod(body.PaymentMethod);
        var subscription = await _subscriptions.CreateRequestAsync(body.TenantId, body.PlanId, body.BillingCycle == "Yearly", method, body.PaymentReference, GetActorId(), cancellationToken);
        var tenant = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == subscription.TenantId, cancellationToken);
        var plan = await _db.Plans.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == subscription.PlanId, cancellationToken);
        var invoice = await _db.Invoices.IgnoreQueryFilters().AsNoTracking().OrderByDescending(x => x.IssuedAtUtc).FirstOrDefaultAsync(x => x.SubscriptionId == subscription.Id, cancellationToken);
        return Ok(new PlatformSubscriptionRowDto(
            subscription.Id,
            subscription.TenantId,
            tenant?.Name ?? subscription.TenantId.ToString(),
            "Tenant Admin",
            string.Empty,
            "SaaS",
            subscription.Status,
            plan?.Name ?? subscription.PlanId.ToString(),
            "renewal",
            $"Current subscription on {plan?.Name ?? "Plan"}",
            invoice?.Amount ?? 0m,
            invoice?.PaymentMethod,
            invoice?.PaymentReference ?? string.Empty,
            subscription.CreatedAt,
            subscription.StartDate,
            subscription.EndDate,
            subscription.TrialEndsAt,
            subscription.IsTrial,
            subscription.AutoRenew,
            subscription.PendingPlanId,
            subscription.DowngradeEffectiveAt));
    }

    [HttpPost("subscriptions/{subscriptionId:guid}/approve")]
    public async Task<ActionResult> Approve(Guid subscriptionId, CancellationToken cancellationToken)
    {
        var sub = await _db.Subscriptions.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == subscriptionId, cancellationToken);
        if (sub is null) return NotFound("Subscription not found.");
        if (sub.Status != SubscriptionLifecycleStatus.Requested.ToString()) return BadRequest("Only Requested can be approved.");
        sub.Status = SubscriptionLifecycleStatus.AwaitingPayment.ToString();
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("SubscriptionApproved", GetActorId(), "Subscription", sub.Id.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("subscriptions/{subscriptionId:guid}/confirm-payment")]
    public async Task<ActionResult> ConfirmPayment(Guid subscriptionId, [FromBody] ConfirmPaymentRequest body, CancellationToken cancellationToken)
    {
        if (!HasBillingPermission("payment.verify")) return Forbid();
        var invoice = await _db.Invoices.IgnoreQueryFilters().OrderByDescending(x => x.IssuedAtUtc)
            .FirstOrDefaultAsync(x => x.SubscriptionId == subscriptionId, cancellationToken);
        if (invoice is null) return NotFound("Invoice not found for subscription.");
        var method = ParseMethod(body.PaymentMethod);
        var result = await _billing.ConfirmPaymentAsync(invoice.Id, GetActorId(), method, body.PaymentReference, cancellationToken, body.DecisionReason, body.EvidenceUrl);
        if (!result.Changed && result.Message.Contains("already paid", StringComparison.OrdinalIgnoreCase))
            return Ok(new { message = result.Message });
        if (!result.Changed) return BadRequest(result.Message);
        await _audit.LogAsync("SubscriptionPaymentConfirmed", GetActorId(), "Invoice", invoice.Id.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("subscriptions/{subscriptionId:guid}/activate")]
    public async Task<ActionResult> Activate(Guid subscriptionId, CancellationToken cancellationToken)
    {
        if (!HasBillingPermission("subscription.activate")) return Forbid();
        var invoice = await _db.Invoices.IgnoreQueryFilters().OrderByDescending(x => x.IssuedAtUtc)
            .FirstOrDefaultAsync(x => x.SubscriptionId == subscriptionId, cancellationToken);
        if (invoice is null) return NotFound("Invoice not found for subscription.");
        var result = await _subscriptions.ActivateFromInvoiceAsync(invoice.Id, GetActorId(), cancellationToken);
        if (!result.Changed) return BadRequest(result.Message);
        return Ok();
    }

    [HttpPost("subscriptions/{subscriptionId:guid}/reject")]
    public async Task<ActionResult> Reject(Guid subscriptionId, CancellationToken cancellationToken)
    {
        var sub = await _db.Subscriptions.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == subscriptionId, cancellationToken);
        if (sub is null) return NotFound("Subscription not found.");
        sub.Status = SubscriptionLifecycleStatus.Cancelled.ToString();
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("SubscriptionRejected", GetActorId(), "Subscription", sub.Id.ToString(), cancellationToken);
        return Ok();
    }

    [HttpGet("invoices")]
    public async Task<ActionResult<IReadOnlyList<InvoiceDto>>> GetInvoices([FromQuery] Guid? tenantId, CancellationToken cancellationToken)
    {
        var query = _db.Invoices.IgnoreQueryFilters().AsNoTracking();
        if (tenantId.HasValue) query = query.Where(x => x.TenantId == tenantId.Value);
        var invoices = await query.OrderByDescending(x => x.IssuedAtUtc)
            .Take(500)
            .Select(x => new InvoiceDto(x.Id, x.TenantId, x.SubscriptionId, x.InvoiceNumber, x.Amount, x.Currency, x.Status, x.IssuedAtUtc, x.DueDateUtc, x.PaidAtUtc, x.PaymentMethod, x.PaymentReference))
            .ToArrayAsync(cancellationToken);
        return Ok(invoices);
    }

    [HttpPost("invoices/{invoiceId:guid}/mark-paid")]
    public async Task<ActionResult> MarkPaid(Guid invoiceId, [FromBody] ConfirmPaymentRequest body, CancellationToken cancellationToken)
    {
        if (!HasBillingPermission("invoice.markPaid")) return Forbid();
        var result = await _billing.ConfirmPaymentAsync(invoiceId, GetActorId(), ParseMethod(body.PaymentMethod), body.PaymentReference, cancellationToken, body.DecisionReason, body.EvidenceUrl);
        if (!result.Changed && !result.Message.Contains("already paid", StringComparison.OrdinalIgnoreCase)) return BadRequest(result.Message);
        await _audit.LogAsync("InvoiceMarkedPaid", GetActorId(), "Invoice", invoiceId.ToString(), cancellationToken);
        return Ok(new { message = result.Message });
    }

    [HttpGet("v2/reconciliation/report")]
    public async Task<ActionResult<ReconciliationReport>> GetReconciliationReport(CancellationToken cancellationToken)
        => Ok(await _reconciliation.RunAsync(cancellationToken));

    [HttpPost("v2/reconciliation/run")]
    public async Task<ActionResult<ReconciliationReport>> RunReconciliation(CancellationToken cancellationToken)
        => Ok(await _reconciliation.RunAsync(cancellationToken));

    [HttpPost("v2/dunning/run")]
    public async Task<ActionResult> RunDunning(CancellationToken cancellationToken)
        => Ok(new { touched = await _dunning.RunAsync(cancellationToken) });

    [HttpGet("v2/revenue/analytics")]
    public async Task<ActionResult<RevenueAnalyticsDto>> GetRevenueAnalytics(CancellationToken cancellationToken)
        => Ok(await _revenueAnalytics.GetAsync(cancellationToken));

    [HttpGet("v2/invoices/{invoiceId:guid}/pdf")]
    public async Task<ActionResult> GetInvoicePdf(Guid invoiceId, CancellationToken cancellationToken)
    {
        var invoice = await _db.Invoices.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == invoiceId, cancellationToken);
        if (invoice is null) return NotFound("Invoice not found.");
        var payload = _invoicePdf.Render(invoice);
        return File(payload, "application/pdf", $"{invoice.InvoiceNumber}.pdf");
    }

    [HttpPost("v2/predictions/outcomes")]
    public async Task<ActionResult> RecordPredictionOutcome([FromBody] PredictionOutcomeRequest body, CancellationToken cancellationToken)
    {
        _db.PredictionOutcomes.Add(new PredictionOutcome
        {
            Id = Guid.NewGuid(),
            TenantId = body.TenantId,
            PredictionId = body.PredictionId.Trim(),
            ActualOutcome = body.ActualOutcome.Trim(),
            Correct = body.Correct,
            RecordedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpGet("v2/predictions/accuracy")]
    public async Task<ActionResult> GetPredictionAccuracy(CancellationToken cancellationToken)
    {
        var rows = await _db.PredictionOutcomes.IgnoreQueryFilters().AsNoTracking().ToArrayAsync(cancellationToken);
        var total = rows.Length;
        var correct = rows.Count(x => x.Correct);
        var accuracy = total == 0 ? 0m : Math.Round((decimal)correct / total * 100m, 2);
        var falsePositives = rows.Count(x => !x.Correct && x.ActualOutcome.Contains("false_positive", StringComparison.OrdinalIgnoreCase));
        var falseNegatives = rows.Count(x => !x.Correct && x.ActualOutcome.Contains("false_negative", StringComparison.OrdinalIgnoreCase));
        return Ok(new { total, correct, accuracy, falsePositives, falseNegatives });
    }

    [HttpGet("v2/kpis")]
    public async Task<ActionResult<RevenueKpiDto>> GetRevenueKpis(CancellationToken cancellationToken)
    {
        var activeSubs = await _db.Subscriptions.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.Status == SubscriptionLifecycleStatus.Active.ToString())
            .ToArrayAsync(cancellationToken);
        var plans = await _db.Plans.IgnoreQueryFilters().AsNoTracking().ToDictionaryAsync(x => x.Id, x => x, cancellationToken);
        var mrr = activeSubs.Sum(x => plans.GetValueOrDefault(x.PlanId)?.PriceMonthly ?? 0m);
        var arr = mrr * 12;
        var arpu = activeSubs.Length == 0 ? 0m : Math.Round(mrr / activeSubs.Length, 2);
        var churnRate = activeSubs.Length == 0 ? 0m : Math.Round((decimal)activeSubs.Count(x => x.Status == SubscriptionLifecycleStatus.Cancelled.ToString()) / activeSubs.Length * 100m, 2);
        return Ok(new RevenueKpiDto(mrr, arr, arpu, 0m, churnRate));
    }

    [HttpGet("v2/subscriptions/{subscriptionId:guid}/payment-attempts")]
    public async Task<ActionResult<IReadOnlyList<PaymentAttemptDto>>> GetPaymentAttempts(Guid subscriptionId, CancellationToken cancellationToken)
    {
        var invoiceIds = await _db.Invoices.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.SubscriptionId == subscriptionId)
            .Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        var paymentIds = await _db.Payments.IgnoreQueryFilters().AsNoTracking()
            .Where(x => invoiceIds.Contains(x.InvoiceId))
            .Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        var attempts = await _db.PaymentAttempts.IgnoreQueryFilters().AsNoTracking()
            .Where(x => paymentIds.Contains(x.PaymentId))
            .OrderByDescending(x => x.AttemptedAt)
            .Select(x => new PaymentAttemptDto(x.Id, x.PaymentId, x.Status, x.AttemptedAt, x.FailureReason))
            .ToArrayAsync(cancellationToken);
        return Ok(attempts);
    }

    [HttpPost("v2/subscriptions/{subscriptionId:guid}/adjustments")]
    public async Task<ActionResult<AdjustmentDto>> AddAdjustment(Guid subscriptionId, [FromBody] AddAdjustmentRequest body, CancellationToken cancellationToken)
    {
        var sub = await _db.Subscriptions.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == subscriptionId, cancellationToken);
        if (sub is null) return NotFound("Subscription not found.");
        var type = Enum.TryParse<BillingAdjustmentType>(body.Type, true, out var parsed) ? parsed : BillingAdjustmentType.Credit;
        var adj = await _billing.AddAdjustmentAsync(sub.TenantId, sub.Id, type, body.Amount, body.Reason, GetActorId(), cancellationToken);
        return Ok(new AdjustmentDto(adj.Id, adj.SubscriptionId, adj.Type, adj.Amount, adj.Reason, adj.ApprovedAt));
    }

    [HttpPost("trials")]
    public async Task<ActionResult> GrantTrial([FromBody] GrantTrialRequest body, CancellationToken cancellationToken)
    {
        var days = body.CustomDays ?? body.Days;
        if (days <= 0) return BadRequest("Trial duration must be positive.");
        await _subscriptions.GrantTrialAsync(body.TenantId, body.PlanId, days, GetActorId(), cancellationToken);
        return Ok();
    }

    [HttpGet("subscriptions/{subscriptionId:guid}/usage")]
    public async Task<ActionResult<UsageDto>> GetUsage(Guid subscriptionId, CancellationToken cancellationToken)
    {
        var sub = await _db.Subscriptions.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == subscriptionId, cancellationToken);
        if (sub is null) return NotFound("Subscription not found.");
        var plan = await _db.Plans.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == sub.PlanId, cancellationToken);
        if (plan is null) return NotFound("Plan not found.");
        var usage = await _usage.GetUsageAsync(sub.TenantId, cancellationToken);
        var comparison = _usage.CompareAgainstPlan(usage, plan);
        return Ok(new UsageDto(
            comparison.Doctors.Used, comparison.Doctors.Limit, comparison.Doctors.PercentUsed, comparison.Doctors.LimitReached,
            comparison.Receptionists.Used, comparison.Receptionists.Limit, comparison.Receptionists.PercentUsed, comparison.Receptionists.LimitReached,
            comparison.Appointments.Used, comparison.Appointments.Limit, comparison.Appointments.PercentUsed, comparison.Appointments.LimitReached,
            comparison.Messages.Used, comparison.Messages.Limit, comparison.Messages.PercentUsed, comparison.Messages.LimitReached));
    }

    private Guid GetActorId()
    {
        var raw = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }

    private static PaymentMethodType ParseMethod(string method)
        => string.Equals(method, "ShamCash", StringComparison.OrdinalIgnoreCase) ? PaymentMethodType.ShamCash : PaymentMethodType.Cash;

    private bool HasBillingPermission(string permission)
    {
        if (User.IsInRole("PlatformAdmin")) return true;
        return User.Claims.Any(c => c.Type == "permission" && string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase));
    }

    public sealed record PlanDto(Guid Id, string Name, decimal PriceMonthly, decimal? PriceYearly, string Currency, string FeaturesJson, int MaxDoctors, int MaxReceptionists, int MaxAppointmentsPerMonth, int MaxMessages, bool IsActive);
    public sealed record UpsertPlanRequest(Guid? Id, string Name, decimal PriceMonthly, decimal? PriceYearly, string Currency, string FeaturesJson, int MaxDoctors, int MaxReceptionists, int MaxAppointmentsPerMonth, int MaxMessages, bool IsActive);
    public sealed record CreatePlatformSubscriptionRequest(Guid TenantId, Guid PlanId, string BillingCycle, string PaymentMethod, string? PaymentReference);
    public sealed record ConfirmPaymentRequest(string PaymentMethod, string? PaymentReference, string? DecisionReason, string? EvidenceUrl);
    public sealed record GrantTrialRequest(Guid TenantId, Guid PlanId, int Days, int? CustomDays);
    public sealed record PlatformSubscriptionRowDto(
        Guid Id,
        Guid TenantId,
        string ClinicName,
        string RequestedByDoctorName,
        string RequestedByDoctorEmail,
        string Channel,
        string Cycle,
        string PlanTier,
        string RequestType,
        string ChangeSummary,
        decimal FinalPriceUsd,
        string? PaymentMethod,
        string PaymentReference,
        DateTime CreatedAtUtc,
        DateTime? StartDate,
        DateTime? EndDate,
        DateTime? TrialEndsAt,
        bool IsTrial,
        bool AutoRenew,
        Guid? PendingPlanId,
        DateTime? DowngradeEffectiveAt);
    public sealed record InvoiceDto(Guid Id, Guid TenantId, Guid SubscriptionId, string InvoiceNumber, decimal Amount, string Currency, string Status, DateTime IssuedAtUtc, DateTime DueDateUtc, DateTime? PaidAtUtc, string PaymentMethod, string? PaymentReference);
    public sealed record AddAdjustmentRequest(string Type, decimal Amount, string Reason);
    public sealed record AdjustmentDto(Guid Id, Guid SubscriptionId, string Type, decimal Amount, string Reason, DateTime ApprovedAtUtc);
    public sealed record PaymentAttemptDto(Guid Id, Guid PaymentId, string Status, DateTime AttemptedAtUtc, string FailureReason);
    public sealed record RevenueKpiDto(decimal Mrr, decimal Arr, decimal Arpu, decimal ExpansionRevenue, decimal ChurnRate);
    public sealed record PredictionOutcomeRequest(Guid TenantId, string PredictionId, string ActualOutcome, bool Correct);
    public sealed record UsageDto(
        int DoctorsUsed, int DoctorsLimit, decimal DoctorsPercent, bool DoctorsLimitReached,
        int ReceptionistsUsed, int ReceptionistsLimit, decimal ReceptionistsPercent, bool ReceptionistsLimitReached,
        int AppointmentsUsed, int AppointmentsLimit, decimal AppointmentsPercent, bool AppointmentsLimitReached,
        int MessagesUsed, int MessagesLimit, decimal MessagesPercent, bool MessagesLimitReached);
}

