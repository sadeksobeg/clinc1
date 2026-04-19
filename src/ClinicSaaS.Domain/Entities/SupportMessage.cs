using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class SupportMessage : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid ConversationId { get; set; }
    public Guid? SenderUserId { get; set; }
    public string SenderType { get; set; } = "Agent";
    public string Body { get; set; } = string.Empty;
    public bool IsInternalNote { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
