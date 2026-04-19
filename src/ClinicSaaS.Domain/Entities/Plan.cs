using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class Plan : Entity
{
    public string Name { get; set; } = string.Empty;
    public decimal PriceMonthly { get; set; }
    public decimal? PriceYearly { get; set; }
    public string Currency { get; set; } = "USD";
    public string FeaturesJson { get; set; } = "{}";
    public int MaxDoctors { get; set; }
    public int MaxReceptionists { get; set; }
    public int MaxAppointmentsPerMonth { get; set; }
    public int MaxMessages { get; set; }
    public int IncludedUnits { get; set; }
    public decimal OveragePricePerUnit { get; set; }
    public bool AllowOverage { get; set; }
    public bool IsActive { get; set; } = true;
}

