using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class VisitType : Entity, ITenantEntity
{
    public string Name { get; set; } = string.Empty;
    public int DurationMinutes { get; set; }

    public Guid TenantId { get; set; }
}

