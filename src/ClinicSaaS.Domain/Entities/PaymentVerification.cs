using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class PaymentVerification : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid PaymentId { get; set; }
    public string Reference { get; set; } = string.Empty;
    public Guid VerifiedBy { get; set; }
    public DateTime VerifiedAt { get; set; } = DateTime.UtcNow;
    public string Notes { get; set; } = string.Empty;
}

