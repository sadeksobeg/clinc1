using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class SubscriptionContract : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid SubscriptionId { get; set; }
    public decimal? MonthlyPriceOverride { get; set; }
    public decimal? DiscountPercent { get; set; }
    public int? MaxDoctorsOverride { get; set; }
    public int? MaxReceptionistsOverride { get; set; }
    public int? MaxAppointmentsOverride { get; set; }
    public int? MaxMessagesOverride { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public string Notes { get; set; } = string.Empty;
}

