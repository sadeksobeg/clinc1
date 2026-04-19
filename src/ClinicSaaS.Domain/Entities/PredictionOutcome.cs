using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class PredictionOutcome : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string PredictionId { get; set; } = string.Empty;
    public string ActualOutcome { get; set; } = string.Empty;
    public bool Correct { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}

