using ClinicSaaS.Api.Services;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/tenant/subscription")]
[Authorize]
public sealed class TenantSubscriptionController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly UsageService _usage;
    private readonly SubscriptionService _subscriptions;

    public TenantSubscriptionController(ClinicDbContext db, UsageService usage, SubscriptionService subscriptions)
    {
        _db = db;
        _usage = usage;
        _subscriptions = subscriptions;
    }

    [HttpGet]
    public async Task<ActionResult<TenantSubscriptionDto>> GetCurrent(CancellationToken cancellationToken)
    {
        var tenantRaw = User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(tenantRaw, out var tenantId)) return BadRequest("Tenant context is missing.");
        var sub = await _db.Subscriptions.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        if (sub is null) return NotFound("Subscription not found.");
        var plan = await _db.Plans.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == sub.PlanId, cancellationToken);
        if (plan is null) return NotFound("Plan not found.");
        var remainingDays = sub.EndDate.HasValue ? Math.Max(0, (int)Math.Ceiling((sub.EndDate.Value - DateTime.UtcNow).TotalDays)) : 0;
        return Ok(new TenantSubscriptionDto(sub.Id, sub.TenantId, plan.Id, plan.Name, sub.Status, sub.StartDate, sub.EndDate, sub.TrialEndsAt, sub.IsTrial, remainingDays));
    }

    [HttpGet("usage")]
    public async Task<ActionResult<TenantUsageDto>> GetUsage(CancellationToken cancellationToken)
    {
        var tenantRaw = User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(tenantRaw, out var tenantId)) return BadRequest("Tenant context is missing.");
        var sub = await _db.Subscriptions.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        if (sub is null) return NotFound("Subscription not found.");
        var plan = await _db.Plans.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == sub.PlanId, cancellationToken);
        if (plan is null) return NotFound("Plan not found.");
        var usage = await _usage.GetUsageAsync(tenantId, cancellationToken);
        var comparison = _usage.CompareAgainstPlan(usage, plan);
        var forecast = _usage.BuildForecast(usage);
        var doctorsPolicy = _usage.EvaluateEnforcement(comparison.Doctors, graceBuffer: 2);
        var appointmentsPolicy = _usage.EvaluateEnforcement(comparison.Appointments, graceBuffer: 50);

        return Ok(new TenantUsageDto(
            new UsageItemDto(comparison.Doctors.Used, comparison.Doctors.Limit, comparison.Doctors.PercentUsed, comparison.Doctors.LimitReached),
            new UsageItemDto(comparison.Receptionists.Used, comparison.Receptionists.Limit, comparison.Receptionists.PercentUsed, comparison.Receptionists.LimitReached),
            new UsageItemDto(comparison.Appointments.Used, comparison.Appointments.Limit, comparison.Appointments.PercentUsed, comparison.Appointments.LimitReached),
            new UsageItemDto(comparison.Messages.Used, comparison.Messages.Limit, comparison.Messages.PercentUsed, comparison.Messages.LimitReached),
            new UsageForecastDto(forecast.DoctorsProjected, forecast.ReceptionistsProjected, forecast.AppointmentsProjected, forecast.MessagesProjected),
            new UsagePolicyDto(doctorsPolicy.Mode, doctorsPolicy.Blocked, doctorsPolicy.OverageUnits, appointmentsPolicy.Mode, appointmentsPolicy.Blocked, appointmentsPolicy.OverageUnits)));
    }

    [HttpGet("plans")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<TenantPlanDto>>> GetPlans(CancellationToken cancellationToken)
    {
        var plans = await _db.Plans.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.PriceMonthly)
            .Select(x => new TenantPlanDto(x.Id, x.Name, x.PriceMonthly, x.PriceYearly, x.Currency, x.FeaturesJson, x.MaxDoctors, x.MaxReceptionists, x.MaxAppointmentsPerMonth, x.MaxMessages))
            .ToArrayAsync(cancellationToken);
        return Ok(plans);
    }

    [HttpPost("request")]
    public async Task<ActionResult<TenantSubscriptionDto>> CreateRequest([FromBody] CreateTenantRequest body, CancellationToken cancellationToken)
    {
        var tenantRaw = User.FindFirst("tenant_id")?.Value;
        var actorRaw = User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(tenantRaw, out var tenantId)) return BadRequest("Tenant context is missing.");
        if (!Guid.TryParse(actorRaw, out var actorId)) actorId = Guid.Empty;
        var method = string.Equals(body.PaymentMethod, "ShamCash", StringComparison.OrdinalIgnoreCase)
            ? Domain.Subscriptions.PaymentMethodType.ShamCash
            : Domain.Subscriptions.PaymentMethodType.Cash;
        var sub = await _subscriptions.CreateRequestAsync(tenantId, body.PlanId, body.BillingCycle == "Yearly", method, body.PaymentReference, actorId, cancellationToken);
        var plan = await _db.Plans.IgnoreQueryFilters().AsNoTracking().FirstAsync(x => x.Id == sub.PlanId, cancellationToken);
        var remainingDays = sub.EndDate.HasValue ? Math.Max(0, (int)Math.Ceiling((sub.EndDate.Value - DateTime.UtcNow).TotalDays)) : 0;
        return Ok(new TenantSubscriptionDto(sub.Id, sub.TenantId, sub.PlanId, plan.Name, sub.Status, sub.StartDate, sub.EndDate, sub.TrialEndsAt, sub.IsTrial, remainingDays));
    }

    [HttpGet("invoices")]
    public async Task<ActionResult<IReadOnlyList<TenantInvoiceDto>>> GetInvoices(CancellationToken cancellationToken)
    {
        var tenantRaw = User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(tenantRaw, out var tenantId)) return BadRequest("Tenant context is missing.");
        var invoices = await _db.Invoices.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.IssuedAtUtc)
            .Take(50)
            .Select(x => new TenantInvoiceDto(x.Id, x.InvoiceNumber, x.Amount, x.Currency, x.Status, x.IssuedAtUtc, x.DueDateUtc, x.PaidAtUtc, x.PaymentMethod, x.PaymentReference))
            .ToArrayAsync(cancellationToken);
        return Ok(invoices);
    }

    [HttpPost("change-plan")]
    public async Task<ActionResult> ChangePlan([FromBody] ChangePlanRequest body, CancellationToken cancellationToken)
    {
        var tenantRaw = User.FindFirst("tenant_id")?.Value;
        var actorRaw = User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(tenantRaw, out var tenantId)) return BadRequest("Tenant context is missing.");
        if (!Guid.TryParse(actorRaw, out var actorId)) actorId = Guid.Empty;
        var result = await _subscriptions.ChangePlanAsync(tenantId, body.TargetPlanId, body.ImmediateUpgrade, actorId, cancellationToken);
        if (!result.Changed) return BadRequest(result.Message);
        return Ok(new { message = result.Message });
    }

    public sealed record TenantSubscriptionDto(Guid Id, Guid TenantId, Guid PlanId, string PlanName, string Status, DateTime? StartDate, DateTime? EndDate, DateTime? TrialEndsAt, bool IsTrial, int RemainingDays);
    public sealed record UsageItemDto(int Used, int Limit, decimal PercentUsed, bool LimitReached);
    public sealed record TenantUsageDto(UsageItemDto Doctors, UsageItemDto Receptionists, UsageItemDto Appointments, UsageItemDto Messages, UsageForecastDto Forecast, UsagePolicyDto Policy);
    public sealed record UsageForecastDto(int DoctorsProjected, int ReceptionistsProjected, int AppointmentsProjected, int MessagesProjected);
    public sealed record UsagePolicyDto(string DoctorsMode, bool DoctorsBlocked, int DoctorsOverageUnits, string AppointmentsMode, bool AppointmentsBlocked, int AppointmentsOverageUnits);
    public sealed record TenantPlanDto(Guid Id, string Name, decimal PriceMonthly, decimal? PriceYearly, string Currency, string FeaturesJson, int MaxDoctors, int MaxReceptionists, int MaxAppointmentsPerMonth, int MaxMessages);
    public sealed record CreateTenantRequest(Guid PlanId, string BillingCycle, string PaymentMethod, string? PaymentReference);
    public sealed record ChangePlanRequest(Guid TargetPlanId, bool ImmediateUpgrade);
    public sealed record TenantInvoiceDto(Guid Id, string InvoiceNumber, decimal Amount, string Currency, string Status, DateTime IssuedAtUtc, DateTime DueDateUtc, DateTime? PaidAtUtc, string PaymentMethod, string? PaymentReference);
}

