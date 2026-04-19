using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Subscriptions;

namespace ClinicSaaS.Domain.Entities;

public sealed class Subscription : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid PlanId { get; set; }
    public string Status { get; set; } = SubscriptionLifecycleStatus.Requested.ToString();
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public DateTime? TrialEndsAt { get; set; }
    public bool IsTrial { get; set; }
    public bool AutoRenew { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DowngradeEffectiveAt { get; set; }
    public Guid? PendingPlanId { get; set; }
    public Guid? PlanVersionId { get; set; }
    public DateTime? GraceEndsAt { get; set; }
}

