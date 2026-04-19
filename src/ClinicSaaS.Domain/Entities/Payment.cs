using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Subscriptions;

namespace ClinicSaaS.Domain.Entities;

public sealed class Payment : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid InvoiceId { get; set; }
    public string Method { get; set; } = PaymentMethodType.Cash.ToString();
    public string Reference { get; set; } = string.Empty;
    public string Status { get; set; } = PaymentStatus.Pending.ToString();
    public decimal Amount { get; set; }
    public string EvidenceUrl { get; set; } = string.Empty;
    public string DecisionReason { get; set; } = string.Empty;
    public Guid? ConfirmedByAdmin { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

