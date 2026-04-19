using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class AddonCatalogItem : Entity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string UnitType { get; set; } = string.Empty;
    public decimal UnitPriceUsd { get; set; }
    public bool IsActive { get; set; } = true;
}
