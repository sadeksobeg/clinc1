using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Enums;

namespace ClinicSaaS.Domain.Entities;

public sealed class Doctor : Entity, ITenantEntity
{
    public string Name { get; set; } = string.Empty;
    public string Specialty { get; set; } = string.Empty;

    // Serialized as jsonb in PostgreSQL via EF configuration.
    public ClinicSaaS.Domain.WorkingHours.WorkingHours WorkingHours { get; set; } = new();

    /// <summary>Optional link to a <see cref="User"/> id for doctor login (JWT sub).</summary>
    public Guid? LinkedUserId { get; set; }

    public Guid TenantId { get; set; }
}

