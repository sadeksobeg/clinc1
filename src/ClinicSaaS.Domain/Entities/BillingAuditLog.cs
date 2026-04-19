using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class BillingAuditLog : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
    public Guid ActorId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

