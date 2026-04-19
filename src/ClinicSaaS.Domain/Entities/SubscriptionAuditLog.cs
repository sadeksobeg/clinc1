using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class SubscriptionAuditLog : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid? SubscriptionRequestId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public Guid? ActorUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
