using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class PlanVersion : Entity
{
    public Guid PlanId { get; set; }
    public int Version { get; set; }
    public decimal PriceMonthly { get; set; }
    public decimal? PriceYearly { get; set; }
    public int MaxDoctors { get; set; }
    public int MaxReceptionists { get; set; }
    public int MaxAppointmentsPerMonth { get; set; }
    public int MaxMessages { get; set; }
    public DateTime EffectiveFrom { get; set; } = DateTime.UtcNow;
}

