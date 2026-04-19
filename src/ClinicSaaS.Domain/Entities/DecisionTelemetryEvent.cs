using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class DecisionTelemetryEvent : ITenantEntity
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? UserId { get; set; }
    public string PredictionId { get; set; } = string.Empty;
    public string DecisionId { get; set; } = string.Empty;
    public string ActionId { get; set; } = string.Empty;
    public string Outcome { get; set; } = string.Empty; // applied|succeeded|failed|ignored
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
    public string? CorrelationId { get; set; }
    public string? MetadataJson { get; set; }
}

