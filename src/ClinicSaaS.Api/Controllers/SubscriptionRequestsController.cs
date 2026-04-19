using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using ClinicSaaS.Application.Billing;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/subscriptions")]
[Authorize(Policy = "DoctorOrPlatform")]
public sealed class SubscriptionRequestsController : ControllerBase
{
    private readonly ClinicDbContext _db;

    public SubscriptionRequestsController(ClinicDbContext db)
    {
        _db = db;
    }

    [HttpGet("pricing")]
    [AllowAnonymous]
    public async Task<ActionResult<PricingPreviewDto>> Pricing([FromQuery] decimal annualDiscountPercent = 15m, CancellationToken cancellationToken = default)
    {
        var discount = Math.Clamp(annualDiscountPercent, 0m, 80m);
        var addons = await _db.AddonCatalogItems.AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.Name)
            .Select(x => new AddonCatalogDto(x.Id, x.Code, x.Name, x.UnitType, x.UnitPriceUsd))
            .ToArrayAsync(cancellationToken);

        var rows = new List<PricingRowDto>();
        foreach (var tier in PricingCalculator.SupportedTiers)
        {
            foreach (var channel in PricingCalculator.SupportedChannels)
            {
                var monthly = PricingCalculator.ResolveMonthlyPrice(tier, channel);
                var annual = PricingCalculator.CalculateAnnualPrice(monthly, discount);
                var limits = PricingCalculator.ResolveIncludedLimits(tier);
                rows.Add(new PricingRowDto(tier, channel, monthly, annual, discount, limits.Appointments, limits.Conversations, limits.Seats));
            }
        }
        return Ok(new PricingPreviewDto(rows, addons));
    }

    [HttpPost("requests")]
    public async Task<ActionResult<SubscriptionRequestDto>> CreateRequest(
        [FromBody] CreateSubscriptionRequestDto dto,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.RequestedByDoctorName) || string.IsNullOrWhiteSpace(dto.RequestedByDoctorEmail))
            return BadRequest("Doctor name and email are required.");

        var paymentMethod = NormalizePaymentMethod(dto.PaymentMethod);
        if (paymentMethod is null)
            return BadRequest("Payment method must be Cash or ShamCash.");

        var channel = PricingCalculator.NormalizeChannel(dto.Channel);
        var tier = PricingCalculator.NormalizeTier(dto.PlanTier);
        var cycle = dto.Cycle is "Annual" ? "Annual" : "Monthly";
        var tenantId = ResolveTenantId();
        if (tenantId == Guid.Empty)
            return BadRequest("Tenant context is missing. Please re-login and try again.");

        var existingPending = await FindPendingRequestAsync(tenantId, cancellationToken);
        if (existingPending is not null)
        {
            return Conflict(new SubscriptionRequestPolicyDto(
                CanCreateNewRequest: false,
                BlockingReason: "pending_request_exists",
                CurrentPendingRequest: ToPolicyItem(existingPending),
                RecommendedNextAction: "wait_for_platform_decision",
                CurrentPlan: await ResolveCurrentPlanAsync(tenantId, cancellationToken)));
        }

        var monthly = PricingCalculator.ResolveMonthlyPrice(tier, channel);
        var discount = PricingCalculator.NormalizeDiscount(dto.AnnualDiscountPercent <= 0 ? 15m : dto.AnnualDiscountPercent);
        var baseFinal = cycle == "Annual" ? PricingCalculator.CalculateAnnualPrice(monthly, discount) : monthly;

        var addonIds = dto.AddonItemIds ?? Array.Empty<Guid>();
        var addonItems = await _db.AddonCatalogItems.AsNoTracking()
            .Where(x => addonIds.Contains(x.Id) && x.IsActive)
            .ToArrayAsync(cancellationToken);
        var addonTotal = addonItems.Sum(x => x.UnitPriceUsd);
        var final = baseFinal + addonTotal;

        var request = new SubscriptionRequest
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicName = dto.ClinicName.Trim(),
            RequestedByDoctorName = dto.RequestedByDoctorName.Trim(),
            RequestedByDoctorEmail = dto.RequestedByDoctorEmail.Trim(),
            RequestedByPhone = dto.RequestedByPhone?.Trim() ?? string.Empty,
            PlanTier = tier,
            Channel = channel,
            Cycle = cycle,
            MonthlyPriceUsd = monthly,
            AnnualDiscountPercent = discount,
            FinalPriceUsd = final,
            PaymentReference = dto.PaymentReference?.Trim() ?? string.Empty,
            Notes = BuildRequestNotes(paymentMethod, dto.Notes),
            RequestedAddonsJson = JsonSerializer.Serialize(addonItems.Select(x => x.Code)),
            Status = SubscriptionRequestStatus.Requested.ToString(),
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.SubscriptionRequests.Add(request);
        _db.SubscriptionRequestStatusHistory.Add(new SubscriptionRequestStatusHistory
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            SubscriptionRequestId = request.Id,
            FromStatus = string.Empty,
            ToStatus = SubscriptionRequestStatus.Requested.ToString(),
            Note = "Request submitted by clinic user.",
            ChangedByUserId = TryUserGuid(User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value),
            CreatedAtUtc = DateTime.UtcNow
        });
        _db.SubscriptionAuditLogs.Add(new SubscriptionAuditLog
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            SubscriptionRequestId = request.Id,
            Action = "RequestCreated",
            Details = $"Request for {tier} {channel}/{cycle} at {final} USD",
            ActorUserId = TryUserGuid(User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value),
            CreatedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(ToDto(request, await ResolveCurrentPlanAsync(tenantId, cancellationToken)));
    }

    [HttpGet("requests/mine")]
    public async Task<ActionResult<IReadOnlyList<SubscriptionRequestDto>>> MyRequests(CancellationToken cancellationToken)
    {
        var tenantId = ResolveTenantId();
        if (tenantId == Guid.Empty) return BadRequest("Tenant context is missing.");
        var currentPlan = await ResolveCurrentPlanAsync(tenantId, cancellationToken);
        var items = await _db.SubscriptionRequests.AsNoTracking()
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(20)
            .Select(x => ToDto(x, currentPlan))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpGet("requests/policy")]
    public async Task<ActionResult<SubscriptionRequestPolicyDto>> RequestPolicy(CancellationToken cancellationToken)
    {
        var tenantId = ResolveTenantId();
        if (tenantId == Guid.Empty) return BadRequest("Tenant context is missing.");
        var pending = await FindPendingRequestAsync(tenantId, cancellationToken);
        var canCreate = pending is null;
        return Ok(new SubscriptionRequestPolicyDto(
            CanCreateNewRequest: canCreate,
            BlockingReason: canCreate ? null : "pending_request_exists",
            CurrentPendingRequest: pending is null ? null : ToPolicyItem(pending),
            RecommendedNextAction: canCreate ? "create_new_request" : "wait_for_platform_decision",
            CurrentPlan: await ResolveCurrentPlanAsync(tenantId, cancellationToken)));
    }

    [HttpGet("requests/{requestId:guid}/timeline")]
    public async Task<ActionResult<IReadOnlyList<SubscriptionRequestTimelineItemDto>>> RequestTimeline(Guid requestId, CancellationToken cancellationToken)
    {
        var items = await _db.SubscriptionRequestStatusHistory.AsNoTracking()
            .Where(x => x.SubscriptionRequestId == requestId)
            .OrderBy(x => x.CreatedAtUtc)
            .Select(x => new SubscriptionRequestTimelineItemDto(x.Id, x.SubscriptionRequestId, x.FromStatus, x.ToStatus, x.Note, x.CreatedAtUtc))
            .ToArrayAsync(cancellationToken);

        return Ok(items);
    }

    private static Guid? TryUserGuid(string? raw) => Guid.TryParse(raw, out var id) ? id : null;
    private Guid ResolveTenantId()
    {
        var raw = User.FindFirst("tenant_id")?.Value;
        return Guid.TryParse(raw, out var tenantId) ? tenantId : Guid.Empty;
    }

    private static SubscriptionRequestDto ToDto(SubscriptionRequest x, string currentPlan)
        => new(
            x.Id,
            x.TenantId,
            x.ClinicName,
            x.RequestedByDoctorName,
            x.RequestedByDoctorEmail,
            x.RequestedByPhone,
            x.PlanTier,
            x.Channel,
            x.Cycle,
            x.MonthlyPriceUsd,
            x.AnnualDiscountPercent,
            x.FinalPriceUsd,
            x.PaymentReference,
            x.Notes,
            ExtractPaymentMethod(x.Notes),
            x.Status,
            DetectRequestType(currentPlan, x.PlanTier),
            BuildChangeSummary(currentPlan, x.PlanTier, x.Channel, x.Cycle),
            x.DecisionReason,
            x.CreatedAtUtc,
            x.ReviewedAtUtc);

    private async Task<SubscriptionRequest?> FindPendingRequestAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var pendingStatuses = new[]
        {
            SubscriptionRequestStatus.Requested.ToString(),
            SubscriptionRequestStatus.AwaitingPayment.ToString(),
            SubscriptionRequestStatus.PaymentConfirmed.ToString()
        };
        return await _db.SubscriptionRequests.AsNoTracking()
            .Where(x => x.TenantId == tenantId && pendingStatuses.Contains(x.Status))
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<string> ResolveCurrentPlanAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var plan = await _db.Tenants.AsNoTracking()
            .Where(x => x.Id == tenantId)
            .Select(x => x.SubscriptionPlan)
            .FirstOrDefaultAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(plan) ? "Unknown" : plan;
    }

    private static PendingSubscriptionRequestDto ToPolicyItem(SubscriptionRequest x)
        => new(x.Id, x.PlanTier, x.Channel, x.Cycle, x.Status, x.CreatedAtUtc, x.FinalPriceUsd);

    private static string DetectRequestType(string currentPlan, string requestedPlan)
    {
        var current = NormalizeTierRank(currentPlan);
        var requested = NormalizeTierRank(requestedPlan);
        if (current == 0 || requested == 0) return "plan_change";
        if (requested > current) return "upgrade";
        if (requested < current) return "downgrade";
        return "renewal";
    }

    private static int NormalizeTierRank(string tier)
    {
        var value = tier?.Trim().ToLowerInvariant() ?? string.Empty;
        if (value is "starter" or "basic") return 1;
        if (value == "pro") return 2;
        if (value == "growth") return 3;
        return 0;
    }

    private static string BuildChangeSummary(string currentPlan, string requestedPlan, string channel, string cycle)
        => $"Current: {currentPlan} -> Requested: {requestedPlan} ({channel}/{cycle})";

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

    private static string BuildRequestNotes(string paymentMethod, string? notes)
    {
        var cleanNotes = notes?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(cleanNotes))
            return $"[PaymentMethod:{paymentMethod}]";

        return $"[PaymentMethod:{paymentMethod}] {cleanNotes}";
    }

    private static string ExtractPaymentMethod(string notes)
    {
        const string cashTag = "[PaymentMethod:Cash]";
        const string shamCashTag = "[PaymentMethod:ShamCash]";
        if (notes.StartsWith(cashTag, StringComparison.OrdinalIgnoreCase))
            return "Cash";
        if (notes.StartsWith(shamCashTag, StringComparison.OrdinalIgnoreCase))
            return "ShamCash";
        return "Unknown";
    }

    public sealed record CreateSubscriptionRequestDto(
        string ClinicName,
        string RequestedByDoctorName,
        string RequestedByDoctorEmail,
        string? RequestedByPhone,
        string PlanTier,
        string Channel,
        string Cycle,
        decimal AnnualDiscountPercent,
        Guid[]? AddonItemIds,
        string PaymentMethod,
        string? PaymentReference,
        string? Notes);

    public sealed record SubscriptionRequestDto(
        Guid Id,
        Guid TenantId,
        string ClinicName,
        string RequestedByDoctorName,
        string RequestedByDoctorEmail,
        string RequestedByPhone,
        string PlanTier,
        string Channel,
        string Cycle,
        decimal MonthlyPriceUsd,
        decimal AnnualDiscountPercent,
        decimal FinalPriceUsd,
        string PaymentReference,
        string Notes,
        string PaymentMethod,
        string Status,
        string RequestType,
        string ChangeSummary,
        string? DecisionReason,
        DateTime CreatedAtUtc,
        DateTime? ReviewedAtUtc);
    public sealed record PendingSubscriptionRequestDto(
        Guid Id,
        string PlanTier,
        string Channel,
        string Cycle,
        string Status,
        DateTime CreatedAtUtc,
        decimal FinalPriceUsd);
    public sealed record SubscriptionRequestPolicyDto(
        bool CanCreateNewRequest,
        string? BlockingReason,
        PendingSubscriptionRequestDto? CurrentPendingRequest,
        string RecommendedNextAction,
        string CurrentPlan);
    public sealed record SubscriptionRequestTimelineItemDto(
        Guid Id,
        Guid SubscriptionRequestId,
        string FromStatus,
        string ToStatus,
        string Note,
        DateTime CreatedAtUtc);

    public sealed record PricingPreviewDto(IReadOnlyList<PricingRowDto> Rows, IReadOnlyList<AddonCatalogDto> Addons);
    public sealed record PricingRowDto(
        string Tier,
        string Channel,
        decimal MonthlyPriceUsd,
        decimal AnnualPriceUsd,
        decimal AnnualDiscountPercent,
        int IncludedAppointments,
        int IncludedConversations,
        int IncludedDoctorSeats);
    public sealed record AddonCatalogDto(Guid Id, string Code, string Name, string UnitType, decimal UnitPriceUsd);
}
