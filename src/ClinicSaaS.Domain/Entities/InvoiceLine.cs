using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class InvoiceLine : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid InvoiceId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public decimal Total { get; set; }

    // Backward-compat aliases used by legacy flows.
    public decimal UnitPriceUsd { get => UnitPrice; set => UnitPrice = value; }
    public decimal LineTotalUsd { get => Total; set => Total = value; }
}

