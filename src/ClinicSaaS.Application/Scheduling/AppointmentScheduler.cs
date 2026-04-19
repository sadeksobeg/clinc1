using ClinicSaaS.Domain.Entities;

namespace ClinicSaaS.Application.Scheduling;

public sealed class AppointmentScheduler
{
    private static readonly TimeSpan SlotGranularity = TimeSpan.FromMinutes(5);

    private readonly IAppointmentSchedulerData _data;

    public AppointmentScheduler(IAppointmentSchedulerData data)
    {
        _data = data;
    }

    public async Task<IReadOnlyList<AvailableSlotDto>> GetAvailableSlots(
        Guid doctorId,
        DateOnly date,
        Guid visitTypeId,
        CancellationToken cancellationToken = default)
    {
        var doctorName = await _data.GetDoctorDisplayNameAsync(doctorId, cancellationToken);
        var workingHours = await _data.GetDoctorWorkingHoursAsync(doctorId, cancellationToken);
        var durationMinutes = await _data.GetVisitTypeDurationMinutesAsync(visitTypeId, cancellationToken);
        var existingAppointments = await _data.GetScheduledAppointmentsForDoctorAsync(doctorId, date, cancellationToken);

        var dayOfWeek = (int)date.DayOfWeek; // 0 = Sunday ... 6 = Saturday
        var daySchedule = workingHours.Days.FirstOrDefault(d => d.DayOfWeek == dayOfWeek);
        if (daySchedule is null || daySchedule.Windows.Count == 0)
            return Array.Empty<AvailableSlotDto>();

        var utcOffset = TimeSpan.Zero;
        var duration = TimeSpan.FromMinutes(durationMinutes);

        var slots = new List<AvailableSlotDto>();

        foreach (var window in daySchedule.Windows)
        {
            var windowStartLocal = date.ToDateTime(window.Start);
            var windowEndLocal = date.ToDateTime(window.End);

            if (windowEndLocal <= windowStartLocal)
                continue;

            var slotStartLocal = windowStartLocal;
            while (slotStartLocal.Add(duration) <= windowEndLocal)
            {
                var slotEndLocal = slotStartLocal.Add(duration);
                var candidateStart = new DateTimeOffset(slotStartLocal, utcOffset);
                var candidateEnd = new DateTimeOffset(slotEndLocal, utcOffset);

                if (!OverlapsAny(candidateStart, candidateEnd, existingAppointments))
                {
                    slots.Add(new AvailableSlotDto
                    {
                        DoctorId = doctorId,
                        DoctorName = doctorName,
                        StartTime = candidateStart,
                        EndTime = candidateEnd
                    });
                }

                slotStartLocal = slotStartLocal.Add(SlotGranularity);
            }
        }

        return slots.OrderBy(s => s.StartTime).ToArray();
    }

    // Used by receptionist "walk-in" flows: pick the earliest slot >= fromDateTime.
    public async Task<AvailableSlotDto?> GetNearestAvailableSlot(
        Guid doctorId,
        DateTimeOffset fromDateTime,
        Guid visitTypeId,
        int maxDaysAhead = 14,
        CancellationToken cancellationToken = default)
    {
        for (var dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset++)
        {
            var date = DateOnly.FromDateTime(fromDateTime.UtcDateTime.Date).AddDays(dayOffset);

            var slots = await GetAvailableSlots(doctorId, date, visitTypeId, cancellationToken);
            if (slots.Count == 0)
                continue;

            if (dayOffset == 0)
            {
                var utcFrom = fromDateTime.ToUniversalTime();
                var first = slots.FirstOrDefault(s => s.StartTime >= utcFrom);
                if (first is not null)
                    return first;
            }
            else
            {
                return slots[0];
            }
        }

        return null;
    }

    public async Task<IReadOnlyList<AvailableSlotDto>> GetNextBookableSlotsAcrossDoctors(
        DateTimeOffset fromUtc,
        Guid visitTypeId,
        int maxSlots = 8,
        int maxDaysAhead = 14,
        CancellationToken cancellationToken = default)
    {
        var doctors = await _data.ListDoctorsAsync(cancellationToken);
        if (doctors.Count == 0)
            return Array.Empty<AvailableSlotDto>();

        var from = fromUtc.ToUniversalTime();
        var collected = new List<AvailableSlotDto>();

        for (var dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset++)
        {
            var date = DateOnly.FromDateTime(from.UtcDateTime.Date).AddDays(dayOffset);

            foreach (var (doctorId, _) in doctors)
            {
                var daySlots = await GetAvailableSlots(doctorId, date, visitTypeId, cancellationToken);
                foreach (var s in daySlots)
                {
                    if (dayOffset == 0 && s.StartTime < from)
                        continue;

                    collected.Add(s);
                }
            }
        }

        return collected
            .OrderBy(s => s.StartTime)
            .Take(maxSlots)
            .ToArray();
    }

    private static bool OverlapsAny(DateTimeOffset candidateStart, DateTimeOffset candidateEnd, IReadOnlyList<Appointment> existingAppointments)
    {
        foreach (var appt in existingAppointments)
        {
            // Treat intervals as half-open [start, end) so that back-to-back appointments are allowed.
            if (candidateStart < appt.EndTime && candidateEnd > appt.StartTime)
                return true;
        }

        return false;
    }
}

