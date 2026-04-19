using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class Wallet : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public decimal Balance { get; set; }
    public string Currency { get; set; } = "USD";
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

