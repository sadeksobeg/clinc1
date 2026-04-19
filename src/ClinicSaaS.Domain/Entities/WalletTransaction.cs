using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class WalletTransaction : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid WalletId { get; set; }
    public decimal Amount { get; set; }
    public string Type { get; set; } = "credit";
    public string Reason { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

