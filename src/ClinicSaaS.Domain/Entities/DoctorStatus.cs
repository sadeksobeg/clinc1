using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Enums;

namespace ClinicSaaS.Domain.Entities;

public sealed class DoctorStatus : Entity, ITenantEntity
{
    public Guid DoctorId { get; set; }
    public DoctorStatusType Status { get; set; }

    // Only meaningful when Status == Delayed.
    public int DelayMinutes { get; set; }

    public DateTimeOffset RecordedAt { get; set; }

    public Guid TenantId { get; set; }
}

