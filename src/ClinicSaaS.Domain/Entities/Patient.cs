using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class Patient : Entity, ITenantEntity
{
    public string Name { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;

    public Guid TenantId { get; set; }
}

