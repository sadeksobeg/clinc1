using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.WorkingHours;

namespace ClinicSaaS.Application.Scheduling;

public interface IAppointmentSchedulerData
{
    Task<WorkingHours> GetDoctorWorkingHoursAsync(Guid doctorId, CancellationToken cancellationToken);
    Task<int> GetVisitTypeDurationMinutesAsync(Guid visitTypeId, CancellationToken cancellationToken);
    Task<IReadOnlyList<Appointment>> GetScheduledAppointmentsForDoctorAsync(Guid doctorId, DateOnly date, CancellationToken cancellationToken);
    Task<IReadOnlyList<(Guid Id, string Name)>> ListDoctorsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<(Guid Id, string Name)>> ListVisitTypesAsync(CancellationToken cancellationToken = default);
    Task<string> GetDoctorDisplayNameAsync(Guid doctorId, CancellationToken cancellationToken = default);

    /// <summary>Returns the IANA time-zone id for the current tenant (e.g. "Asia/Baghdad").</summary>
    Task<string> GetTenantTimeZoneIdAsync(CancellationToken cancellationToken = default);

    Task<Guid?> GetDoctorIdByLinkedUserAsync(Guid userId, CancellationToken cancellationToken = default);
}

