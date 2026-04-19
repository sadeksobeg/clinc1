using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Api.Services;
using ClinicSaaS.Application.Billing;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/admin/tenants")]
[Authorize(Policy = "PlatformOnly")]
public sealed class AdminTenantsController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly SubscriptionWorkflowService _workflow;

    public AdminTenantsController(ClinicDbContext db, SubscriptionWorkflowService workflow)
    {
        _db = db;
        _workflow = workflow;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TenantListItemDto>>> List(CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = new DateTimeOffset(today.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var to = from.AddDays(1);

        var tenants = await _db.Tenants.AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.TimeZoneId,
                t.SubscriptionChannel,
                t.SubscriptionCycle,
                t.SubscriptionPlan,
                t.SubscriptionStatus,
                t.MonthlyPriceUsd,
                t.AnnualDiscountPercent,
                t.AddonRevenueUsd,
                t.OverageRevenueUsd,
                HasWebhookSecret = t.WhatsAppWebhookSecret != ""
            })
            .ToArrayAsync(cancellationToken);

        var items = new List<TenantListItemDto>(tenants.Length);
        foreach (var t in tenants)
        {
            var doctorsCount = await _db.Doctors.IgnoreQueryFilters()
                .CountAsync(d => d.TenantId == t.Id, cancellationToken);
            var todayAppointments = await _db.Appointments.IgnoreQueryFilters()
                .CountAsync(
                    a => a.TenantId == t.Id && a.StartTime < to && a.EndTime > from,
                    cancellationToken);

            items.Add(new TenantListItemDto(
                t.Id,
                t.Name,
                t.TimeZoneId,
                t.SubscriptionChannel,
                t.SubscriptionCycle,
                t.SubscriptionPlan,
                t.SubscriptionStatus,
                t.MonthlyPriceUsd,
                t.AnnualDiscountPercent,
                t.AddonRevenueUsd,
                t.OverageRevenueUsd,
                t.HasWebhookSecret,
                doctorsCount,
                todayAppointments));
        }

        return Ok(items);
    }

    [HttpPost("{id:guid}/webhook-secret/rotate")]
    public async Task<ActionResult<RotateWebhookSecretResponse>> RotateWebhookSecret(Guid id, CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
        if (tenant is null)
            return NotFound("Tenant not found.");

        tenant.WhatsAppWebhookSecret = GenerateWebhookSecret();
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(new RotateWebhookSecretResponse(tenant.Id, tenant.WhatsAppWebhookSecret));
    }

    [HttpPost]
    public async Task<ActionResult<TenantListItemDto>> CreateTenant([FromBody] CreateTenantDto dto, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("Name is required.");

        var tenant = new Domain.Entities.Tenant
        {
            Id = Guid.NewGuid(),
            Name = dto.Name.Trim(),
            TimeZoneId = string.IsNullOrWhiteSpace(dto.TimeZoneId) ? "Asia/Baghdad" : dto.TimeZoneId.Trim(),
            SubscriptionChannel = PricingCalculator.NormalizeChannel(dto.Channel),
            SubscriptionCycle = dto.Cycle is "Annual" ? "Annual" : "Monthly",
            SubscriptionPlan = PricingCalculator.NormalizeTier(dto.PlanTier),
            SubscriptionStatus = "TrialActive",
            MonthlyPriceUsd = dto.MonthlyPriceUsd > 0 ? dto.MonthlyPriceUsd : PricingCalculator.ResolveMonthlyPrice(dto.PlanTier, dto.Channel),
            AnnualDiscountPercent = Math.Clamp(dto.AnnualDiscountPercent, 0m, 80m),
            IncludedAppointmentsPerMonth = PricingCalculator.ResolveIncludedLimits(dto.PlanTier).Appointments,
            IncludedConversationsPerMonth = PricingCalculator.ResolveIncludedLimits(dto.PlanTier).Conversations,
            IncludedDoctorSeats = PricingCalculator.ResolveIncludedLimits(dto.PlanTier).Seats,
            SubscriptionActivatedAtUtc = DateTime.UtcNow,
            SubscriptionExpiresAtUtc = DateTime.UtcNow.AddDays(3),
            CreatedAt = DateTime.UtcNow,
            WhatsAppWebhookSecret = GenerateWebhookSecret()
        };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(new TenantListItemDto(
            tenant.Id, tenant.Name, tenant.TimeZoneId, tenant.SubscriptionChannel, tenant.SubscriptionCycle, tenant.SubscriptionPlan, tenant.SubscriptionStatus,
            tenant.MonthlyPriceUsd, tenant.AnnualDiscountPercent, tenant.AddonRevenueUsd, tenant.OverageRevenueUsd, true, 0, 0));
    }

    [HttpGet("subscription-requests")]
    public async Task<ActionResult<IReadOnlyList<SubscriptionQueueItemDto>>> SubscriptionRequests(CancellationToken cancellationToken)
    {
        var rows = await _db.SubscriptionRequests.IgnoreQueryFilters().AsNoTracking()
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(200)
            .Select(x => new
            {
                x.Id, x.TenantId, x.ClinicName, x.RequestedByDoctorName, x.RequestedByDoctorEmail, x.Channel, x.Cycle,
                x.PlanTier, x.FinalPriceUsd, x.Notes, x.PaymentReference, x.RequestedAddonsJson, x.Status, x.CreatedAtUtc, x.DecisionReason
            })
            .ToArrayAsync(cancellationToken);

        var items = rows.Select(x => new SubscriptionQueueItemDto(
            x.Id, x.TenantId, x.ClinicName, x.RequestedByDoctorName, x.RequestedByDoctorEmail, x.Channel, x.Cycle,
            x.PlanTier, x.FinalPriceUsd, ExtractPaymentMethod(x.Notes), x.PaymentReference, x.RequestedAddonsJson, x.Status, x.CreatedAtUtc, x.DecisionReason))
            .ToArray();
        return Ok(items);
    }

    [HttpPost("subscription-requests/{requestId:guid}/review")]
    public async Task<ActionResult> ReviewRequest(Guid requestId, [FromBody] ReviewSubscriptionRequestDto dto, CancellationToken cancellationToken)
    {
        var request = await _db.SubscriptionRequests.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == requestId, cancellationToken);
        if (request is null) return NotFound("Request not found.");
        if (request.Status is nameof(SubscriptionRequestStatus.Activated) or nameof(SubscriptionRequestStatus.Rejected)) return BadRequest("Request already reviewed.");

        var isApproved = string.Equals(dto.Decision, "approve", StringComparison.OrdinalIgnoreCase);

        var paymentMethod = ExtractPaymentMethod(request.Notes);
        if (isApproved)
        {
            paymentMethod = NormalizePaymentMethod(dto.PaymentMethod) ?? paymentMethod;
            if (paymentMethod is null)
                return BadRequest("Payment method is required for approval (Cash or ShamCash).");

            if (!string.IsNullOrWhiteSpace(dto.PaymentReference))
                request.PaymentReference = dto.PaymentReference.Trim();
        }

        var paymentConfirmedAtUtc = dto.PaymentConfirmedAtUtc ?? DateTime.UtcNow;
        var activationDeadlineUtc = paymentConfirmedAtUtc.AddHours(2);
        if (isApproved && DateTime.UtcNow > activationDeadlineUtc)
            return Conflict("Activation window exceeded. Approval must happen within 2 hours from payment confirmation.");

        var actor = TryUserGuid(User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        if (isApproved)
        {
            var approve = await _workflow.ApproveRequestAsync(requestId, dto.Reason, actor, cancellationToken);
            if (approve.Error is not null) return StatusCode(approve.StatusCode, approve.Error);

            var payment = await _workflow.ConfirmPaymentAsync(requestId, paymentMethod!, request.PaymentReference, dto.Reason, actor, cancellationToken);
            if (payment.Error is not null) return StatusCode(payment.StatusCode, payment.Error);

            var activate = await _workflow.ActivateAsync(requestId, dto.Reason, actor, cancellationToken);
            if (activate.Error is not null) return StatusCode(activate.StatusCode, activate.Error);
        }
        else
        {
            var reject = await _workflow.RejectAsync(requestId, dto.Reason, actor, cancellationToken);
            if (reject.Error is not null) return StatusCode(reject.StatusCode, reject.Error);
        }
        return Ok();
    }

    [HttpGet("{id:guid}/subscription-audit")]
    public async Task<ActionResult<IReadOnlyList<SubscriptionAuditDto>>> SubscriptionAudit(Guid id, CancellationToken cancellationToken)
    {
        var items = await _db.SubscriptionAuditLogs.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == id)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(200)
            .Select(x => new SubscriptionAuditDto(x.Id, x.SubscriptionRequestId, x.Action, x.Details, x.ActorUserId, x.CreatedAtUtc))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpGet("addons/catalog")]
    public async Task<ActionResult<IReadOnlyList<AddonCatalogItemDto>>> AddonsCatalog(CancellationToken cancellationToken)
    {
        var items = await _db.AddonCatalogItems.AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => new AddonCatalogItemDto(x.Id, x.Code, x.Name, x.UnitType, x.UnitPriceUsd, x.IsActive))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpPost("addons/catalog")]
    public async Task<ActionResult> UpsertAddonCatalog([FromBody] UpsertAddonCatalogDto dto, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.Code) || string.IsNullOrWhiteSpace(dto.Name) || dto.UnitPriceUsd < 0)
            return BadRequest("Invalid addon payload.");

        var existing = await _db.AddonCatalogItems.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Code == dto.Code, cancellationToken);
        if (existing is null)
        {
            _db.AddonCatalogItems.Add(new Domain.Entities.AddonCatalogItem
            {
                Id = Guid.NewGuid(),
                Code = dto.Code.Trim(),
                Name = dto.Name.Trim(),
                UnitType = dto.UnitType.Trim(),
                UnitPriceUsd = dto.UnitPriceUsd,
                IsActive = dto.IsActive
            });
        }
        else
        {
            existing.Name = dto.Name.Trim();
            existing.UnitType = dto.UnitType.Trim();
            existing.UnitPriceUsd = dto.UnitPriceUsd;
            existing.IsActive = dto.IsActive;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpGet("billing/invoices")]
    public async Task<ActionResult<IReadOnlyList<InvoiceDto>>> BillingInvoices(CancellationToken cancellationToken)
    {
        var items = await _db.Invoices.IgnoreQueryFilters().AsNoTracking()
            .OrderByDescending(x => x.IssuedAtUtc)
            .Take(300)
            .Select(x => new InvoiceDto(
                x.Id,
                x.TenantId,
                x.SubscriptionRequestId,
                x.InvoiceNumber,
                x.Status,
                x.SubtotalUsd,
                x.TaxUsd,
                x.TotalUsd,
                x.Currency,
                x.PaymentEvidenceReference,
                x.IssuedAtUtc,
                x.PaidAtUtc))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpPost("billing/invoices/{invoiceId:guid}/mark-paid")]
    public async Task<ActionResult> MarkInvoicePaid(Guid invoiceId, CancellationToken cancellationToken)
    {
        var invoice = await _db.Invoices.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == invoiceId, cancellationToken);
        if (invoice is null) return NotFound("Invoice not found.");
        invoice.Status = "Paid";
        invoice.PaidAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpPost("{tenantId:guid}/addons")]
    public async Task<ActionResult> AssignTenantAddons(Guid tenantId, [FromBody] AssignTenantAddonsDto dto, CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == tenantId, cancellationToken);
        if (tenant is null) return NotFound("Tenant not found.");

        var existing = await _db.TenantAddonSubscriptions.IgnoreQueryFilters()
            .Where(x => x.TenantId == tenantId)
            .ToArrayAsync(cancellationToken);
        if (existing.Length > 0) _db.TenantAddonSubscriptions.RemoveRange(existing);

        decimal total = 0;
        foreach (var item in dto.Items ?? Array.Empty<TenantAddonItemDto>())
        {
            if (item.Quantity <= 0) continue;
            var addon = await _db.AddonCatalogItems.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == item.AddonCatalogItemId && a.IsActive, cancellationToken);
            if (addon is null) continue;
            _db.TenantAddonSubscriptions.Add(new Domain.Entities.TenantAddonSubscription
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                AddonCatalogItemId = addon.Id,
                Quantity = item.Quantity,
                UnitPriceUsd = addon.UnitPriceUsd,
                CreatedAtUtc = DateTime.UtcNow
            });
            total += addon.UnitPriceUsd * item.Quantity;
        }
        tenant.AddonRevenueUsd = total;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    public sealed record TenantListItemDto(
        Guid Id,
        string Name,
        string TimeZoneId,
        string SubscriptionChannel,
        string SubscriptionCycle,
        string SubscriptionPlan,
        string SubscriptionStatus,
        decimal MonthlyPriceUsd,
        decimal AnnualDiscountPercent,
        decimal AddonRevenueUsd,
        decimal OverageRevenueUsd,
        bool HasWebhookSecret,
        int DoctorsCount,
        int TodayAppointmentsCount);

    public sealed record RotateWebhookSecretResponse(Guid TenantId, string WebhookSecret);
    public sealed record CreateTenantDto(string Name, string? TimeZoneId, string PlanTier, string Channel, string Cycle, decimal MonthlyPriceUsd, decimal AnnualDiscountPercent);
    public sealed record ReviewSubscriptionRequestDto(string Decision, string? Reason, string? PaymentMethod, DateTime? PaymentConfirmedAtUtc, string? PaymentReference);
    public sealed record SubscriptionQueueItemDto(
        Guid Id,
        Guid TenantId,
        string ClinicName,
        string RequestedByDoctorName,
        string RequestedByDoctorEmail,
        string Channel,
        string Cycle,
        string PlanTier,
        decimal FinalPriceUsd,
        string? PaymentMethod,
        string PaymentReference,
        string RequestedAddonsJson,
        string Status,
        DateTime CreatedAtUtc,
        string? DecisionReason);
    public sealed record SubscriptionAuditDto(Guid Id, Guid? SubscriptionRequestId, string Action, string Details, Guid? ActorUserId, DateTime CreatedAtUtc);
    public sealed record AddonCatalogItemDto(Guid Id, string Code, string Name, string UnitType, decimal UnitPriceUsd, bool IsActive);
    public sealed record InvoiceDto(
        Guid Id,
        Guid TenantId,
        Guid? SubscriptionRequestId,
        string InvoiceNumber,
        string Status,
        decimal SubtotalUsd,
        decimal TaxUsd,
        decimal TotalUsd,
        string Currency,
        string PaymentEvidenceReference,
        DateTime IssuedAtUtc,
        DateTime? PaidAtUtc);
    public sealed record UpsertAddonCatalogDto(string Code, string Name, string UnitType, decimal UnitPriceUsd, bool IsActive);
    public sealed record AssignTenantAddonsDto(TenantAddonItemDto[]? Items);
    public sealed record TenantAddonItemDto(Guid AddonCatalogItemId, int Quantity);

    private static string GenerateWebhookSecret()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes);
    }

    private static Guid? TryUserGuid(string? raw) => Guid.TryParse(raw, out var id) ? id : null;
    private static string? NormalizePaymentMethod(string? paymentMethod)
    {
        if (string.IsNullOrWhiteSpace(paymentMethod))
            return null;
        var normalized = paymentMethod.Trim().ToLowerInvariant();
        if (normalized == "cash")
            return "Cash";
        if (normalized is "shamcash" or "sham_cash" or "sham-cash")
            return "ShamCash";
        return null;
    }

    private static string? ExtractPaymentMethod(string notes)
    {
        if (notes.StartsWith("[PaymentMethod:Cash]", StringComparison.OrdinalIgnoreCase))
            return "Cash";
        if (notes.StartsWith("[PaymentMethod:ShamCash]", StringComparison.OrdinalIgnoreCase))
            return "ShamCash";
        return null;
    }

    private static Domain.Entities.Invoice BuildInvoiceFromApprovedRequest(Domain.Entities.SubscriptionRequest request)
    {
        var subtotal = request.FinalPriceUsd;
        var tax = Math.Round(subtotal * 0m, 2, MidpointRounding.AwayFromZero);
        var total = subtotal + tax;
        return new Domain.Entities.Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            SubscriptionRequestId = request.Id,
            InvoiceNumber = $"INV-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
            Status = "Issued",
            SubtotalUsd = subtotal,
            TaxUsd = tax,
            TotalUsd = total,
            Currency = "USD",
            PaymentEvidenceReference = request.PaymentReference ?? string.Empty,
            Notes = request.Notes ?? string.Empty,
            IssuedAtUtc = DateTime.UtcNow
        };
    }

    private static IEnumerable<Domain.Entities.InvoiceLine> BuildInvoiceLines(Domain.Entities.Invoice invoice, Domain.Entities.SubscriptionRequest request)
    {
        yield return new Domain.Entities.InvoiceLine
        {
            Id = Guid.NewGuid(),
            TenantId = invoice.TenantId,
            InvoiceId = invoice.Id,
            Code = $"PLAN-{request.PlanTier.ToUpperInvariant()}",
            Description = $"{request.PlanTier} {request.Channel}/{request.Cycle}",
            Quantity = 1,
            UnitPriceUsd = request.FinalPriceUsd,
            LineTotalUsd = request.FinalPriceUsd
        };
    }
    private static decimal ParseAddonRevenue(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "[]") return 0m;
        try
        {
            var arr = System.Text.Json.JsonSerializer.Deserialize<string[]>(json) ?? Array.Empty<string>();
            return arr.Length * 10m;
        }
        catch
        {
            return 0m;
        }
    }
}
