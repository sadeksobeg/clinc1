using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class OnboardingChecklistState : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public bool AddedDoctor { get; set; }
    public bool AddedVisitType { get; set; }
    public bool ConnectedWhatsApp { get; set; }
    public bool CompletedFirstBooking { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

