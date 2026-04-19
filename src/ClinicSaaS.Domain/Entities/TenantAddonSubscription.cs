using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class TenantAddonSubscription : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid AddonCatalogItemId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPriceUsd { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
