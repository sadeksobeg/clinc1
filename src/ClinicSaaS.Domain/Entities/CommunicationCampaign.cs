using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class CommunicationCampaign : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Channel { get; set; } = "WhatsApp";
    public string TemplateCode { get; set; } = string.Empty;
    public string TargetSegment { get; set; } = "AllPatients";
    public DateTime? ScheduledAtUtc { get; set; }
    public string Status { get; set; } = "Draft";
    public int EstimatedRecipients { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

