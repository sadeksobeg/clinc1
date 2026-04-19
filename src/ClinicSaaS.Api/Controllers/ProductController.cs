using ClinicSaaS.Api.Product;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/product")]
[Authorize(Policy = "TenantUser")]
public sealed class ProductController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly EntitlementService _entitlements;

    public ProductController(ClinicDbContext db, EntitlementService entitlements)
    {
        _db = db;
        _entitlements = entitlements;
    }

    [HttpGet("entitlements")]
    public async Task<ActionResult<EntitlementDto>> Entitlements(CancellationToken cancellationToken)
    {
        var e = await _entitlements.GetSnapshotAsync(cancellationToken);
        return Ok(new EntitlementDto(e.Plan, e.MaxDoctors, e.MaxReceptionists, e.MonthlyConversations, e.HasCampaigns, e.HasAdvancedAnalytics, e.HasApiAccess, e.HasWhiteLabel));
    }

    [HttpGet("analytics/clinic")]
    public async Task<ActionResult<ClinicAnalyticsDto>> ClinicAnalytics(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthAppointments = await _db.Appointments.AsNoTracking().Where(a => a.StartTime >= monthStart).ToArrayAsync(cancellationToken);
        var totalAppointments = monthAppointments.Length;
        var cancelled = monthAppointments.Count(a => a.Status == Domain.Enums.AppointmentStatus.Cancelled);
        var noShow = monthAppointments.Count(a => a.Status == Domain.Enums.AppointmentStatus.NoShow);
        var conversations = await _db.CommunicationConversations.AsNoTracking().CountAsync(a => a.CreatedAtUtc >= monthStart, cancellationToken);
        var activeDoctors = await _db.Doctors.AsNoTracking().CountAsync(cancellationToken);
        var visitGroups = monthAppointments
            .GroupBy(x => x.VisitTypeId)
            .Select(g => new { VisitTypeId = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(5)
            .ToArray();
        var visitTypeNames = await _db.VisitTypes.AsNoTracking()
            .Where(x => visitGroups.Select(v => v.VisitTypeId).Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);
        var visitTypeBreakdown = visitGroups
            .Select(x => new VisitTypeMetricDto(visitTypeNames.GetValueOrDefault(x.VisitTypeId, "Unknown"), x.Count))
            .ToArray();

        var conversion = conversations == 0 ? 0m : Math.Round((totalAppointments * 100m) / conversations, 2);
        var cancellationRate = totalAppointments == 0 ? 0m : Math.Round((cancelled * 100m) / totalAppointments, 2);
        var noShowRate = totalAppointments == 0 ? 0m : Math.Round((noShow * 100m) / totalAppointments, 2);
        var peak = monthAppointments
            .GroupBy(x => x.StartTime.Hour)
            .OrderByDescending(g => g.Count())
            .Select(g => $"{g.Key:00}:00-{((g.Key + 1) % 24):00}:00")
            .FirstOrDefault() ?? "N/A";

        return Ok(new ClinicAnalyticsDto(
            totalAppointments, cancelled, noShow, cancellationRate, noShowRate, conversations, conversion, activeDoctors, 0, peak, visitTypeBreakdown));
    }

    [HttpGet("analytics/platform")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult<PlatformMetricsDto>> PlatformMetrics(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var activeClinics = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().CountAsync(x => x.SubscriptionStatus == "Active", cancellationToken);
        var mrr = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().Where(x => x.SubscriptionStatus == "Active").SumAsync(x => x.MonthlyPriceUsd + x.AddonRevenueUsd, cancellationToken);
        var totalConversations = await _db.CommunicationConversations.IgnoreQueryFilters().AsNoTracking().CountAsync(x => x.CreatedAtUtc >= monthStart, cancellationToken);
        var churnProxy = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().CountAsync(x => x.SubscriptionStatus == "Suspended" || x.SubscriptionStatus == "Expired", cancellationToken);
        var arpu = activeClinics == 0 ? 0m : Math.Round(mrr / activeClinics, 2);
        return Ok(new PlatformMetricsDto(activeClinics, mrr, arpu, churnProxy, totalConversations));
    }

    [HttpGet("onboarding")]
    public async Task<ActionResult<OnboardingStateDto>> Onboarding(CancellationToken cancellationToken)
    {
        var state = await _db.OnboardingChecklistStates.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (state is null)
            return Ok(new OnboardingStateDto(false, false, false, false, 0));

        var progress = new[] { state.AddedDoctor, state.AddedVisitType, state.ConnectedWhatsApp, state.CompletedFirstBooking }.Count(x => x);
        return Ok(new OnboardingStateDto(state.AddedDoctor, state.AddedVisitType, state.ConnectedWhatsApp, state.CompletedFirstBooking, progress));
    }

    [HttpPost("onboarding/{task}/complete")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult> CompleteOnboardingTask(string task, CancellationToken cancellationToken)
    {
        var state = await _db.OnboardingChecklistStates.FirstOrDefaultAsync(cancellationToken);
        if (state is null)
        {
            state = new OnboardingChecklistState
            {
                Id = Guid.NewGuid(),
                UpdatedAtUtc = DateTime.UtcNow
            };
            _db.OnboardingChecklistStates.Add(state);
        }

        task = task.Trim().ToLowerInvariant();
        if (task == "doctor") state.AddedDoctor = true;
        if (task == "visittype") state.AddedVisitType = true;
        if (task == "whatsapp") state.ConnectedWhatsApp = true;
        if (task == "booking") state.CompletedFirstBooking = true;
        state.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpGet("summaries/daily")]
    public async Task<ActionResult<SummaryDto>> DailySummary(CancellationToken cancellationToken)
    {
        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);
        var appointmentsToday = await _db.Appointments.AsNoTracking().CountAsync(a => a.StartTime >= today && a.StartTime < tomorrow, cancellationToken);
        var conversationsToday = await _db.CommunicationConversations.AsNoTracking().CountAsync(a => a.CreatedAtUtc >= today && a.CreatedAtUtc < tomorrow, cancellationToken);
        return Ok(new SummaryDto("Daily", appointmentsToday, conversationsToday, $"Today: {appointmentsToday} appointments, {conversationsToday} conversations."));
    }

    [HttpGet("summaries/weekly")]
    public async Task<ActionResult<SummaryDto>> WeeklySummary(CancellationToken cancellationToken)
    {
        var from = DateTime.UtcNow.Date.AddDays(-7);
        var appointments = await _db.Appointments.AsNoTracking().CountAsync(a => a.StartTime >= from, cancellationToken);
        var conversations = await _db.CommunicationConversations.AsNoTracking().CountAsync(a => a.CreatedAtUtc >= from, cancellationToken);
        return Ok(new SummaryDto("Weekly", appointments, conversations, $"Week: {appointments} appointments, {conversations} conversations."));
    }

    public sealed record EntitlementDto(string Plan, int MaxDoctors, int MaxReceptionists, int MonthlyConversations, bool HasCampaigns, bool HasAdvancedAnalytics, bool HasApiAccess, bool HasWhiteLabel);
    public sealed record VisitTypeMetricDto(string VisitType, int Count);
    public sealed record ClinicAnalyticsDto(int Appointments, int Cancelled, int NoShow, decimal CancellationRatePercent, decimal NoShowRatePercent, int Conversations, decimal ConversionRatePercent, int ActiveDoctors, int WaitTimeAvgMinutes, string PeakHours, IReadOnlyList<VisitTypeMetricDto> VisitTypeBreakdown);
    public sealed record PlatformMetricsDto(int ActiveClinics, decimal MrrUsd, decimal ArpuUsd, int ChurnProxyCount, int TotalConversationsThisMonth);
    public sealed record OnboardingStateDto(bool AddedDoctor, bool AddedVisitType, bool ConnectedWhatsApp, bool CompletedFirstBooking, int ProgressSteps);
    public sealed record SummaryDto(string Period, int Appointments, int Conversations, string Message);
}

