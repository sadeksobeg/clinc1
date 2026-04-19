using ClinicSaaS.Application.Appointments;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace ClinicSaaS.Infrastructure.Persistence.Repositories;

public sealed class AppointmentRepository : IAppointmentRepository
{
    private readonly ClinicDbContext _db;

    public AppointmentRepository(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<Appointment> CreateAsync(Appointment appointment, CancellationToken cancellationToken)
    {
        const int maxQueueAssignAttempts = 3;
        for (var attempt = 1; attempt <= maxQueueAssignAttempts; attempt++)
        {
            var nextQueue = await _db.Appointments
                .Where(a =>
                    a.DoctorId == appointment.DoctorId &&
                    a.QueueDate == appointment.QueueDate)
                .Select(a => (int?)a.QueueNumber)
                .MaxAsync(cancellationToken) ?? 0;

            appointment.QueueNumber = nextQueue + 1;
            _db.Appointments.Add(appointment);

            try
            {
                await _db.SaveChangesAsync(cancellationToken);
                return appointment;
            }
            catch (DbUpdateException ex) when (IsQueueUniqueViolation(ex) && attempt < maxQueueAssignAttempts)
            {
                _db.Entry(appointment).State = EntityState.Detached;
                continue;
            }
            catch (DbUpdateException ex) when (IsExclusionViolation(ex))
            {
                // Map DB-level constraint violation to a domain-level conflict.
                throw new AppointmentSlotConflictException("Requested slot is already booked.");
            }
        }

        throw new AppointmentSlotConflictException("Could not reserve queue number for this appointment. Please retry.");
    }

    public async Task CancelAsync(Guid appointmentId, CancellationToken cancellationToken)
    {
        var appointment = await _db.Appointments.FirstOrDefaultAsync(a => a.Id == appointmentId, cancellationToken);
        if (appointment is null)
            throw new KeyNotFoundException("Appointment not found.");

        if (appointment.Status == AppointmentStatus.Cancelled)
            return;

        appointment.Status = AppointmentStatus.Cancelled;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Appointment?> GetByIdAsync(Guid appointmentId, CancellationToken cancellationToken)
        => await _db.Appointments.FirstOrDefaultAsync(a => a.Id == appointmentId, cancellationToken);

    public async Task SetStatusAsync(Guid appointmentId, AppointmentStatus status, CancellationToken cancellationToken)
    {
        var appointment = await _db.Appointments.FirstOrDefaultAsync(a => a.Id == appointmentId, cancellationToken);
        if (appointment is null)
            throw new KeyNotFoundException("Appointment not found.");

        appointment.Status = status;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<(Appointment Appointment, string DoctorName, string VisitTypeName)>> GetUpcomingByPhoneAsync(
        string phone, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;

        var rows = await _db.Patients
            .Where(p => p.PhoneNumber == phone)
            .Join(
                _db.Appointments.Where(a =>
                    a.Status == AppointmentStatus.Scheduled &&
                    a.StartTime > now),
                p => p.Id,
                a => a.PatientId,
                (p, a) => a)
            .Join(
                _db.Doctors,
                a => a.DoctorId,
                d => d.Id,
                (a, d) => new { Appointment = a, DoctorName = d.Name, a.VisitTypeId })
            .Join(
                _db.VisitTypes,
                x => x.VisitTypeId,
                v => v.Id,
                (x, v) => new { x.Appointment, x.DoctorName, VisitTypeName = v.Name })
            .OrderBy(x => x.Appointment.StartTime)
            .ToArrayAsync(cancellationToken);

        return rows.Select(r => (r.Appointment, r.DoctorName, r.VisitTypeName)).ToArray();
    }

    private static bool IsExclusionViolation(DbUpdateException ex)
    {
        if (ex.InnerException is PostgresException pg)
        {
            // PostgreSQL exclusion constraint violation.
            return pg.SqlState == "23P01";
        }

        return false;
    }

    private static bool IsQueueUniqueViolation(DbUpdateException ex)
    {
        if (ex.InnerException is PostgresException pg)
        {
            return pg.SqlState == "23505" && pg.ConstraintName == "IX_Appointments_TenantId_DoctorId_QueueDate_QueueNumber";
        }

        return false;
    }
}

