using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class BillingPeriod : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid SubscriptionId { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public bool IsCurrent { get; set; }
    public DateTime? ClosedAt { get; set; }
    public bool IsFinalized { get; set; }
}

