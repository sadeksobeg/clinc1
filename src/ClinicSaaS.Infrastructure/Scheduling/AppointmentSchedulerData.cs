using ClinicSaaS.Application.Scheduling;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Domain.WorkingHours;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Infrastructure.Scheduling;

public sealed class AppointmentSchedulerData : IAppointmentSchedulerData
{
    private readonly ClinicDbContext _db;

    public AppointmentSchedulerData(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<WorkingHours> GetDoctorWorkingHoursAsync(Guid doctorId, CancellationToken cancellationToken)
    {
        return await _db.Doctors
            .Where(d => d.Id == doctorId)
            .Select(d => d.WorkingHours)
            .SingleAsync(cancellationToken);
    }

    public async Task<int> GetVisitTypeDurationMinutesAsync(Guid visitTypeId, CancellationToken cancellationToken)
    {
        return await _db.VisitTypes
            .Where(v => v.Id == visitTypeId)
            .Select(v => v.DurationMinutes)
            .SingleAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Appointment>> GetScheduledAppointmentsForDoctorAsync(
        Guid doctorId,
        DateOnly date,
        CancellationToken cancellationToken)
    {
        var from = new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var to = from.AddDays(1);

        // Return any scheduled appointment overlapping the day range.
        return await _db.Appointments
            .Where(a =>
                a.DoctorId == doctorId &&
                a.Status == AppointmentStatus.Scheduled &&
                a.StartTime < to &&
                a.EndTime > from)
            .OrderBy(a => a.StartTime)
            .ToArrayAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<(Guid Id, string Name)>> ListDoctorsAsync(CancellationToken cancellationToken = default)
    {
        var rows = await _db.Doctors
            .OrderBy(d => d.Name)
            .Select(d => new { d.Id, d.Name })
            .ToArrayAsync(cancellationToken);

        return rows.Select(r => (r.Id, r.Name)).ToArray();
    }

    public async Task<string> GetDoctorDisplayNameAsync(Guid doctorId, CancellationToken cancellationToken = default)
    {
        return await _db.Doctors
            .Where(d => d.Id == doctorId)
            .Select(d => d.Name)
            .SingleAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<(Guid Id, string Name)>> ListVisitTypesAsync(CancellationToken cancellationToken = default)
    {
        var rows = await _db.VisitTypes
            .OrderBy(v => v.Name)
            .Select(v => new { v.Id, v.Name })
            .ToArrayAsync(cancellationToken);

        return rows.Select(r => (r.Id, r.Name)).ToArray();
    }

    public async Task<string> GetTenantTimeZoneIdAsync(CancellationToken cancellationToken = default)
    {
        var tenantId = _db.CurrentTenantId;
        var tz = await _db.Tenants
            .Where(t => t.Id == tenantId)
            .Select(t => t.TimeZoneId)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(tz) ? "Asia/Baghdad" : tz!;
    }

    public async Task<Guid?> GetDoctorIdByLinkedUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var id = await _db.Doctors
            .Where(d => d.LinkedUserId == userId)
            .Select(d => (Guid?)d.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return id;
    }
}

