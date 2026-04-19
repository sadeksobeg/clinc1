using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Subscriptions;

namespace ClinicSaaS.Domain.Entities;

public sealed class PaymentAttempt : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid PaymentId { get; set; }
    public DateTime AttemptedAt { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = PaymentStatus.Pending.ToString();
    public string FailureReason { get; set; } = string.Empty;
    public string GatewayResponse { get; set; } = string.Empty;
}

