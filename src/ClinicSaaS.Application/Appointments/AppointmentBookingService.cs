using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Domain.WorkingHours;
using ClinicSaaS.Application.Patients;
using ClinicSaaS.Application.Scheduling;

namespace ClinicSaaS.Application.Appointments;

public sealed class AppointmentBookingService
{
    private readonly IAppointmentSchedulerData _schedulerData;
    private readonly AppointmentScheduler _scheduler;
    private readonly IAppointmentRepository _appointmentRepository;
    private readonly IPatientRepository _patientRepository;

    public AppointmentBookingService(
        IAppointmentSchedulerData schedulerData,
        AppointmentScheduler scheduler,
        IAppointmentRepository appointmentRepository,
        IPatientRepository patientRepository)
    {
        _schedulerData = schedulerData;
        _scheduler = scheduler;
        _appointmentRepository = appointmentRepository;
        _patientRepository = patientRepository;
    }

    public async Task<Appointment> CreateAppointmentAsync(
        CreateAppointmentRequest request,
        CancellationToken cancellationToken = default)
    {
        var startUtc = request.StartTimeUtc.ToUniversalTime();
        var date = DateOnly.FromDateTime(startUtc.UtcDateTime);

        var durationMinutes = await _schedulerData.GetVisitTypeDurationMinutesAsync(request.VisitTypeId, cancellationToken);
        var endUtc = startUtc.AddMinutes(durationMinutes);

        var workingHours = await _schedulerData.GetDoctorWorkingHoursAsync(request.DoctorId, cancellationToken);
        if (!FitsWithinWorkingHours(workingHours, date, startUtc, endUtc))
            throw new ArgumentException("Requested slot is outside the doctor's working hours.");

        var existingAppointments = await _schedulerData.GetScheduledAppointmentsForDoctorAsync(request.DoctorId, date, cancellationToken);
        if (OverlapsAny(startUtc, endUtc, existingAppointments))
            throw new AppointmentSlotConflictException("Requested slot is already booked.");

        var appointment = new Appointment
        {
            DoctorId = request.DoctorId,
            PatientId = request.PatientId,
            VisitTypeId = request.VisitTypeId,
            StartTime = startUtc,
            EndTime = endUtc,
            QueueDate = DateOnly.FromDateTime(startUtc.UtcDateTime),
            Status = AppointmentStatus.Scheduled
        };

        return await _appointmentRepository.CreateAsync(appointment, cancellationToken);
    }

    public async Task<Appointment> WalkInAsync(
        WalkInAppointmentRequest request,
        CancellationToken cancellationToken = default)
    {
        var patient = new Patient
        {
            Name = request.PatientName,
            PhoneNumber = request.PhoneNumber,
            Notes = request.Notes
        };

        var createdPatient = await _patientRepository.CreateAsync(patient, cancellationToken);

        var from = (request.FromDateTimeUtc ?? DateTimeOffset.UtcNow).ToUniversalTime();

        Guid doctorId;
        AvailableSlotDto? nearest;

        if (request.DoctorId is Guid specifiedDoctorId)
        {
            doctorId = specifiedDoctorId;
            nearest = await _scheduler.GetNearestAvailableSlot(
                doctorId,
                from,
                request.VisitTypeId,
                cancellationToken: cancellationToken);
        }
        else
        {
            var doctors = await _schedulerData.ListDoctorsAsync(cancellationToken);
            if (doctors.Count == 0)
                throw new AppointmentSlotConflictException("No doctors configured for walk-in booking.");

            nearest = null;
            doctorId = default;
            foreach (var (id, _) in doctors)
            {
                var slot = await _scheduler.GetNearestAvailableSlot(
                    id,
                    from,
                    request.VisitTypeId,
                    cancellationToken: cancellationToken);

                if (slot is null)
                    continue;

                if (nearest is null || slot.StartTime < nearest.StartTime)
                {
                    nearest = slot;
                    doctorId = id;
                }
            }

            if (nearest is null || doctorId == default)
                throw new AppointmentSlotConflictException("No available slots found for walk-in booking.");
        }

        if (nearest is null)
            throw new AppointmentSlotConflictException("No available slots found for walk-in booking.");

        return await CreateAppointmentAsync(
            new CreateAppointmentRequest(
                doctorId,
                createdPatient.Id,
                request.VisitTypeId,
                nearest.StartTime),
            cancellationToken);
    }

    public Task CancelAppointmentAsync(Guid appointmentId, CancellationToken cancellationToken = default)
        => _appointmentRepository.CancelAsync(appointmentId, cancellationToken);

    public async Task UpdateAppointmentStatusAsync(
        Guid appointmentId,
        AppointmentStatus newStatus,
        Guid currentUserId,
        UserRole role,
        CancellationToken cancellationToken = default)
    {
        if (newStatus is not (AppointmentStatus.Completed or AppointmentStatus.NoShow))
            throw new ArgumentException("Only Completed or NoShow are supported.");

        var appt = await _appointmentRepository.GetByIdAsync(appointmentId, cancellationToken);
        if (appt is null)
            throw new KeyNotFoundException("Appointment not found.");

        if (appt.Status != AppointmentStatus.Scheduled)
            throw new ArgumentException("Only scheduled appointments can be updated to Completed or NoShow.");

        if (role == UserRole.Doctor)
        {
            var doctorId = await _schedulerData.GetDoctorIdByLinkedUserAsync(currentUserId, cancellationToken);
            if (doctorId is null || doctorId.Value != appt.DoctorId)
                throw new UnauthorizedAccessException("Not allowed to modify another doctor's appointment.");
        }
        else if (role is not (UserRole.Receptionist or UserRole.PlatformAdmin))
        {
            throw new UnauthorizedAccessException("Not allowed to change appointment status.");
        }

        await _appointmentRepository.SetStatusAsync(appointmentId, newStatus, cancellationToken);
    }

    private static bool FitsWithinWorkingHours(
        WorkingHours workingHours,
        DateOnly date,
        DateTimeOffset startUtc,
        DateTimeOffset endUtc)
    {
        var dayOfWeek = (int)date.DayOfWeek;
        var daySchedule = workingHours.Days.FirstOrDefault(d => d.DayOfWeek == dayOfWeek);
        if (daySchedule is null)
            return false;

        var start = startUtc.UtcDateTime;
        var end = endUtc.UtcDateTime;

        foreach (var window in daySchedule.Windows)
        {
            var windowStart = date.ToDateTime(window.Start);
            var windowEnd = date.ToDateTime(window.End);

            if (start >= windowStart && end <= windowEnd)
                return true;
        }

        return false;
    }

    private static bool OverlapsAny(
        DateTimeOffset candidateStart,
        DateTimeOffset candidateEnd,
        IReadOnlyList<Appointment> existingAppointments)
    {
        foreach (var appt in existingAppointments)
        {
            if (candidateStart < appt.EndTime && candidateEnd > appt.StartTime)
                return true;
        }

        return false;
    }
}

