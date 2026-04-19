using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class CommunicationConversation : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string Channel { get; set; } = "WhatsApp";
    public string ContactName { get; set; } = string.Empty;
    public string ContactPhone { get; set; } = string.Empty;
    public string Direction { get; set; } = "Inbound";
    public string MessagePreview { get; set; } = string.Empty;
    public string Status { get; set; } = "Open";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

