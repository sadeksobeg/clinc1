using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Subscriptions;

namespace ClinicSaaS.Domain.Entities;

public sealed class Invoice : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid? SubscriptionRequestId { get; set; }
    public Guid SubscriptionId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public long InvoiceSequence { get; set; }
    public decimal Amount { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Tax { get; set; }
    public decimal Discount { get; set; }
    public string Currency { get; set; } = "USD";
    public string Status { get; set; } = InvoiceStatus.Draft.ToString();
    public DateTime IssuedAtUtc { get; set; }
    public DateTime DueDateUtc { get; set; }
    public DateTime? PaidAtUtc { get; set; }
    public string PaymentMethod { get; set; } = PaymentMethodType.Cash.ToString();
    public string? PaymentReference { get; set; }
    public string PaymentDecisionReason { get; set; } = string.Empty;
    public string TaxId { get; set; } = string.Empty;

    // Backward-compat aliases used by legacy flows.
    public decimal SubtotalUsd { get => Subtotal == 0 ? Amount : Subtotal; set => Subtotal = value; }
    public decimal TaxUsd { get => Tax; set => Tax = value; }
    public decimal TotalUsd { get => Amount; set => Amount = value; }
    public string PaymentEvidenceReference { get => PaymentReference ?? string.Empty; set => PaymentReference = value; }
    public string Notes { get; set; } = string.Empty;
}

