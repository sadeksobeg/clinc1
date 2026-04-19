using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class SubscriptionRequest : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public string RequestedByDoctorName { get; set; } = string.Empty;
    public string RequestedByDoctorEmail { get; set; } = string.Empty;
    public string RequestedByPhone { get; set; } = string.Empty;
    public string PlanTier { get; set; } = "Pro";
    public string Channel { get; set; } = "WhatsApp";
    public string Cycle { get; set; } = "Monthly";
    public decimal MonthlyPriceUsd { get; set; }
    public decimal AnnualDiscountPercent { get; set; }
    public decimal FinalPriceUsd { get; set; }
    public string PaymentReference { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string RequestedAddonsJson { get; set; } = "[]";
    public string Status { get; set; } = "Requested";
    public string? DecisionReason { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
}
