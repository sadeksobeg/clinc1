using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class ConversationState : Entity, ITenantEntity
{
    public string Phone { get; set; } = string.Empty;

    public string State { get; set; } = "idle";

    public string Data { get; set; } = "{}";

    public DateTimeOffset UpdatedAt { get; set; }

    public Guid TenantId { get; set; }
}
