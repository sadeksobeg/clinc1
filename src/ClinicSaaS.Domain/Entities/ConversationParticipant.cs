using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class ConversationParticipant : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid ConversationId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = string.Empty;
    public DateTime AddedAtUtc { get; set; } = DateTime.UtcNow;
}
