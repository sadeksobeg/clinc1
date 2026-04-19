using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;

namespace ClinicSaaS.Application.Appointments;

public interface IAppointmentRepository
{
    Task<Appointment> CreateAsync(Appointment appointment, CancellationToken cancellationToken);
    Task CancelAsync(Guid appointmentId, CancellationToken cancellationToken);

    Task<Appointment?> GetByIdAsync(Guid appointmentId, CancellationToken cancellationToken);

    Task SetStatusAsync(Guid appointmentId, AppointmentStatus status, CancellationToken cancellationToken);

    /// <summary>Returns upcoming scheduled appointments (StartTime &gt; now) for a patient identified by phone number, ordered by StartTime.</summary>
    Task<IReadOnlyList<(Appointment Appointment, string DoctorName, string VisitTypeName)>> GetUpcomingByPhoneAsync(
        string phone, CancellationToken cancellationToken);
}

