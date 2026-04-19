using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Application.Billing;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/operations")]
[Authorize(Policy = "ReceptionOrPlatform")]
public sealed class OperationsController : ControllerBase
{
    private readonly ClinicDbContext _db;

    public OperationsController(ClinicDbContext db)
    {
        _db = db;
    }

    [HttpGet("activity-feed")]
    public async Task<ActionResult<IReadOnlyList<ActivityItemDto>>> ActivityFeed(CancellationToken cancellationToken)
    {
        var since = DateTimeOffset.UtcNow.AddDays(-7);
        var appointments = await _db.Appointments.AsNoTracking()
            .Where(a => a.StartTime >= since)
            .OrderByDescending(a => a.StartTime)
            .Take(30)
            .Select(a => new ActivityItemDto(
                a.Id.ToString(),
                "appointment",
                a.Status == AppointmentStatus.Cancelled ? "Appointment cancelled" : "Appointment scheduled/updated",
                a.StartTime))
            .ToArrayAsync(cancellationToken);

        var statuses = await _db.DoctorStatuses.AsNoTracking()
            .Where(s => s.RecordedAt >= since)
            .OrderByDescending(s => s.RecordedAt)
            .Take(30)
            .Select(s => new ActivityItemDto(
                s.Id.ToString(),
                "doctor_status",
                $"Doctor marked {s.Status}",
                s.RecordedAt))
            .ToArrayAsync(cancellationToken);

        var merged = appointments.Concat(statuses)
            .OrderByDescending(x => x.OccurredAt)
            .Take(50)
            .ToArray();
        return Ok(merged);
    }

    [HttpGet("notifications")]
    public async Task<ActionResult<IReadOnlyList<NotificationItemDto>>> Notifications(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var delayedDoctors = await _db.DoctorStatuses.AsNoTracking()
            .Where(s => s.Status == DoctorStatusType.Delayed && s.RecordedAt >= now.AddHours(-6))
            .OrderByDescending(s => s.RecordedAt)
            .Take(10)
            .Select(s => new NotificationItemDto(
                s.Id.ToString(),
                "warning",
                $"Doctor delay: {s.DelayMinutes} minutes",
                s.RecordedAt))
            .ToArrayAsync(cancellationToken);

        return Ok(delayedDoctors);
    }

    [HttpPost("leads")]
    [AllowAnonymous]
    public async Task<ActionResult> CreateLead([FromBody] CreateLeadDto dto, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.ClinicName) || string.IsNullOrWhiteSpace(dto.ContactName) || string.IsNullOrWhiteSpace(dto.ContactEmail))
            return BadRequest("Clinic name, contact name and email are required.");

        _db.MarketingLeads.Add(new MarketingLead
        {
            Id = Guid.NewGuid(),
            ClinicName = dto.ClinicName.Trim(),
            ContactName = dto.ContactName.Trim(),
            ContactEmail = dto.ContactEmail.Trim(),
            ContactPhone = dto.ContactPhone?.Trim() ?? string.Empty,
            PreferredChannel = dto.PreferredChannel is "Telegram" ? "Telegram" : "WhatsApp",
            Notes = dto.Notes?.Trim() ?? string.Empty,
            CreatedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpGet("leads")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult<IReadOnlyList<LeadItemDto>>> Leads(CancellationToken cancellationToken)
    {
        var items = await _db.MarketingLeads.AsNoTracking()
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(200)
            .Select(x => new LeadItemDto(x.Id, x.ClinicName, x.ContactName, x.ContactEmail, x.ContactPhone, x.PreferredChannel, x.Notes, x.CreatedAtUtc))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpGet("usage")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult<UsageSummaryDto>> Usage(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var monthStart = new DateTimeOffset(new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc));
        var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (tenant is null) return NotFound("Tenant not found.");

        var appointments = await _db.Appointments.AsNoTracking()
            .CountAsync(a => a.StartTime >= monthStart, cancellationToken);
        var conversations = await _db.CommunicationConversations.AsNoTracking()
            .CountAsync(c => c.CreatedAtUtc >= monthStart.UtcDateTime, cancellationToken);
        var activeDoctors = await _db.Doctors.AsNoTracking().CountAsync(cancellationToken);
        var addonRevenue = await _db.TenantAddonSubscriptions.AsNoTracking()
            .SumAsync(x => (decimal?)x.Quantity * x.UnitPriceUsd, cancellationToken) ?? 0m;

        var overageAppointments = Math.Max(0, appointments - tenant.IncludedAppointmentsPerMonth);
        var overageConversations = Math.Max(0, conversations - tenant.IncludedConversationsPerMonth);
        var overageSeats = Math.Max(0, activeDoctors - tenant.IncludedDoctorSeats);
        var overageRevenue =
            (overageAppointments * PricingCalculator.ResolveOveragePerAppointmentUsd(tenant.SubscriptionPlan)) +
            (overageConversations * PricingCalculator.ResolveOveragePerConversationUsd(tenant.SubscriptionPlan)) +
            (overageSeats * PricingCalculator.ResolveOveragePerSeatUsd(tenant.SubscriptionPlan));

        return Ok(new UsageSummaryDto(
            tenant.SubscriptionStatus,
            tenant.SubscriptionChannel,
            tenant.SubscriptionCycle,
            tenant.SubscriptionPlan,
            tenant.MonthlyPriceUsd,
            tenant.AnnualDiscountPercent,
            new UsageMetricDto("appointments", appointments, tenant.IncludedAppointmentsPerMonth),
            new UsageMetricDto("conversations", conversations, tenant.IncludedConversationsPerMonth),
            new UsageMetricDto("doctorSeats", activeDoctors, tenant.IncludedDoctorSeats),
            addonRevenue,
            Math.Round(overageRevenue, 2, MidpointRounding.AwayFromZero)));
    }

    [HttpGet("reports/overview")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult<CommercialReportDto>> OverviewReport([FromQuery] int months = 6, CancellationToken cancellationToken = default)
    {
        months = Math.Clamp(months, 1, 24);
        var since = DateTime.UtcNow.AddMonths(-months);

        var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (tenant is null) return NotFound("Tenant not found.");

        var approvedRequests = await _db.SubscriptionRequests.AsNoTracking()
            .CountAsync(x => x.Status == "Approved" && x.CreatedAtUtc >= since, cancellationToken);
        var totalRequests = await _db.SubscriptionRequests.AsNoTracking()
            .CountAsync(x => x.CreatedAtUtc >= since, cancellationToken);
        var activeSubscriptions = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(t => t.SubscriptionStatus == "Active", cancellationToken);
        var monthlyRevenue = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.SubscriptionStatus == "Active")
            .SumAsync(t => t.MonthlyPriceUsd + t.AddonRevenueUsd, cancellationToken);

        var conversionRate = totalRequests == 0 ? 0m : Math.Round((approvedRequests * 100m) / totalRequests, 2);
        return Ok(new CommercialReportDto(activeSubscriptions, monthlyRevenue, totalRequests, approvedRequests, conversionRate));
    }

    [HttpGet("billing/breakdown")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult<BillingBreakdownDto>> BillingBreakdown(CancellationToken cancellationToken)
    {
        var usage = await Usage(cancellationToken);
        var u = usage.Value;
        if (u is null) return NotFound("Usage not found.");
        var total = u.MonthlyPriceUsd + u.AddonRevenueUsd + u.OverageRevenueUsd;
        return Ok(new BillingBreakdownDto(u.SubscriptionPlan, u.SubscriptionChannel, u.SubscriptionCycle, u.MonthlyPriceUsd, u.AddonRevenueUsd, u.OverageRevenueUsd, Math.Round(total, 2)));
    }

    [HttpGet("addons/catalog")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult<IReadOnlyList<AddonCatalogItemDto>>> AddonsCatalog(CancellationToken cancellationToken)
    {
        var items = await _db.AddonCatalogItems.AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.Name)
            .Select(x => new AddonCatalogItemDto(x.Id, x.Code, x.Name, x.UnitType, x.UnitPriceUsd))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpGet("reports/overview.csv")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult> OverviewReportCsv([FromQuery] int months = 6, CancellationToken cancellationToken = default)
    {
        var data = (await OverviewReport(months, cancellationToken)).Value;
        if (data is null) return NotFound();
        var csv = string.Join('\n', new[]
        {
            "Metric,Value",
            $"ActiveSubscriptions,{data.ActiveSubscriptions}",
            $"EstimatedMrrUsd,{data.EstimatedMrrUsd}",
            $"TotalRequests,{data.TotalRequests}",
            $"ApprovedRequests,{data.ApprovedRequests}",
            $"ConversionRatePercent,{data.ConversionRatePercent}"
        });
        return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", "overview-report.csv");
    }

    [HttpGet("reports/commercial")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult<CommercialInsightsDto>> CommercialInsights(CancellationToken cancellationToken)
    {
        var byTier = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.SubscriptionStatus == "Active")
            .GroupBy(x => x.SubscriptionPlan)
            .Select(g => new TierRevenueDto(g.Key, g.Count(), g.Sum(x => x.MonthlyPriceUsd)))
            .ToArrayAsync(cancellationToken);

        var byChannel = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.SubscriptionStatus == "Active")
            .GroupBy(x => x.SubscriptionChannel)
            .Select(g => new ChannelRevenueDto(g.Key, g.Sum(x => x.MonthlyPriceUsd)))
            .ToArrayAsync(cancellationToken);

        var addonRevenue = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.SubscriptionStatus == "Active")
            .SumAsync(x => x.AddonRevenueUsd, cancellationToken);

        var overageRevenue = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.SubscriptionStatus == "Active")
            .SumAsync(x => x.OverageRevenueUsd, cancellationToken);

        return Ok(new CommercialInsightsDto(byTier, byChannel, addonRevenue, overageRevenue));
    }

    public sealed record ActivityItemDto(string Id, string Type, string Message, DateTimeOffset OccurredAt);
    public sealed record NotificationItemDto(string Id, string Severity, string Message, DateTimeOffset CreatedAt);
    public sealed record UsageMetricDto(string Key, int Used, int Included);
    public sealed record UsageSummaryDto(
        string SubscriptionStatus,
        string SubscriptionChannel,
        string SubscriptionCycle,
        string SubscriptionPlan,
        decimal MonthlyPriceUsd,
        decimal AnnualDiscountPercent,
        UsageMetricDto Appointments,
        UsageMetricDto Conversations,
        UsageMetricDto DoctorSeats,
        decimal AddonRevenueUsd,
        decimal OverageRevenueUsd);
    public sealed record CommercialReportDto(
        int ActiveSubscriptions,
        decimal EstimatedMrrUsd,
        int TotalRequests,
        int ApprovedRequests,
        decimal ConversionRatePercent);
    public sealed record BillingBreakdownDto(
        string PlanTier,
        string Channel,
        string Cycle,
        decimal BasePlanUsd,
        decimal AddonsUsd,
        decimal OverageUsd,
        decimal TotalProjectedUsd);
    public sealed record AddonCatalogItemDto(Guid Id, string Code, string Name, string UnitType, decimal UnitPriceUsd);
    public sealed record TierRevenueDto(string Tier, int ActiveTenants, decimal RevenueUsd);
    public sealed record ChannelRevenueDto(string Channel, decimal RevenueUsd);
    public sealed record CommercialInsightsDto(
        IReadOnlyList<TierRevenueDto> ByTier,
        IReadOnlyList<ChannelRevenueDto> ByChannel,
        decimal AddonRevenueUsd,
        decimal OverageRevenueUsd);
    public sealed record CreateLeadDto(string ClinicName, string ContactName, string ContactEmail, string? ContactPhone, string PreferredChannel, string? Notes);
    public sealed record LeadItemDto(Guid Id, string ClinicName, string ContactName, string ContactEmail, string ContactPhone, string PreferredChannel, string Notes, DateTime CreatedAtUtc);
}
