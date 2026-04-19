using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class SubscriptionRequestStatusHistory : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid SubscriptionRequestId { get; set; }
    public string FromStatus { get; set; } = string.Empty;
    public string ToStatus { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public Guid? ChangedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

