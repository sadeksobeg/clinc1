using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Subscriptions;

namespace ClinicSaaS.Domain.Entities;

public sealed class BillingAdjustment : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid SubscriptionId { get; set; }
    public string Type { get; set; } = BillingAdjustmentType.Credit.ToString();
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public Guid ApprovedBy { get; set; }
    public DateTime ApprovedAt { get; set; } = DateTime.UtcNow;
}

