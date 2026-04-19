using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class UsageService
{
    private readonly ClinicDbContext _db;

    public UsageService(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<TenantUsageSnapshot> GetUsageAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
        var doctors = await _db.Doctors.IgnoreQueryFilters().AsNoTracking().CountAsync(x => x.TenantId == tenantId, cancellationToken);
        var receptionists = await _db.Users.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x => x.TenantId == tenantId && x.Role == Domain.Enums.UserRole.Receptionist && !x.IsDisabled, cancellationToken);
        var appointments = await _db.Appointments.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x => x.TenantId == tenantId && x.StartTime >= monthStart, cancellationToken);
        var messages = await _db.SupportMessages.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x => x.TenantId == tenantId && x.CreatedAtUtc >= monthStart, cancellationToken);
        return new TenantUsageSnapshot(doctors, receptionists, appointments, messages);
    }

    public PlanUsageComparison CompareAgainstPlan(TenantUsageSnapshot usage, Domain.Entities.Plan plan)
    {
        return new PlanUsageComparison(
            Doctors: new UsageItem(usage.DoctorsCount, plan.MaxDoctors),
            Receptionists: new UsageItem(usage.ReceptionistsCount, plan.MaxReceptionists),
            Appointments: new UsageItem(usage.AppointmentsThisMonth, plan.MaxAppointmentsPerMonth),
            Messages: new UsageItem(usage.MessagesThisMonth, plan.MaxMessages));
    }

    public UsageForecast BuildForecast(TenantUsageSnapshot usage)
    {
        var now = DateTime.UtcNow;
        var daysInMonth = DateTime.DaysInMonth(now.Year, now.Month);
        var daysPassed = Math.Max(1, now.Day);
        static int Forecast(int used, int daysPassed, int totalDays) => (int)Math.Ceiling((used / (double)daysPassed) * totalDays);

        return new UsageForecast(
            Forecast(usage.DoctorsCount, daysPassed, daysInMonth),
            Forecast(usage.ReceptionistsCount, daysPassed, daysInMonth),
            Forecast(usage.AppointmentsThisMonth, daysPassed, daysInMonth),
            Forecast(usage.MessagesThisMonth, daysPassed, daysInMonth));
    }

    public UsageEnforcement EvaluateEnforcement(UsageItem item, int graceBuffer)
    {
        if (item.Limit <= 0) return new UsageEnforcement("soft_limit", false, 0);
        if (item.Used >= item.Limit + graceBuffer) return new UsageEnforcement("hard_limit", true, item.Used - item.Limit);
        if (item.Used >= item.Limit) return new UsageEnforcement("grace_buffer", false, item.Used - item.Limit);
        return new UsageEnforcement("soft_limit", false, 0);
    }
}

public sealed record TenantUsageSnapshot(int DoctorsCount, int ReceptionistsCount, int AppointmentsThisMonth, int MessagesThisMonth);
public sealed record UsageItem(int Used, int Limit)
{
    public decimal PercentUsed => Limit <= 0 ? 0 : Math.Round((Used * 100m) / Limit, 2);
    public bool LimitReached => Limit > 0 && Used >= Limit;
}
public sealed record PlanUsageComparison(UsageItem Doctors, UsageItem Receptionists, UsageItem Appointments, UsageItem Messages);
public sealed record UsageForecast(int DoctorsProjected, int ReceptionistsProjected, int AppointmentsProjected, int MessagesProjected);
public sealed record UsageEnforcement(string Mode, bool Blocked, int OverageUnits);

