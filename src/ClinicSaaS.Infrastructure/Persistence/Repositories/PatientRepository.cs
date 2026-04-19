using ClinicSaaS.Application.Patients;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Infrastructure.Persistence.Repositories;

public sealed class PatientRepository : IPatientRepository
{
    private readonly ClinicDbContext _db;

    public PatientRepository(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<Patient> CreateAsync(Patient patient, CancellationToken cancellationToken)
    {
        _db.Patients.Add(patient);
        await _db.SaveChangesAsync(cancellationToken);
        return patient;
    }

    public async Task DeleteAsync(Guid patientId, CancellationToken cancellationToken = default)
    {
        var entity = await _db.Patients.FirstOrDefaultAsync(p => p.Id == patientId, cancellationToken);
        if (entity is null)
            return;

        _db.Patients.Remove(entity);
        await _db.SaveChangesAsync(cancellationToken);
    }
}

