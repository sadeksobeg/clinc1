using ClinicSaaS.Domain.Entities;

namespace ClinicSaaS.Application.Patients;

public interface IPatientRepository
{
    Task<Patient> CreateAsync(Patient patient, CancellationToken cancellationToken);
    Task DeleteAsync(Guid patientId, CancellationToken cancellationToken = default);
}

