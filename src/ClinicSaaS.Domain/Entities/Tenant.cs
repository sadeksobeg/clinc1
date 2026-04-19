namespace ClinicSaaS.Domain.Entities;

public sealed class Tenant
{
    private static readonly TimeSpan OnlineWindow = TimeSpan.FromMinutes(2);

    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;

    // Keep as string for flexibility (plans can evolve without migrations changes).
    public string SubscriptionPlan { get; set; } = "Pro";

    /// <summary>IANA time-zone id used for patient-facing messages (e.g. "Asia/Baghdad").</summary>
    public string TimeZoneId { get; set; } = "Asia/Baghdad";

    /// <summary>Secret required by external WhatsApp webhook callers for this tenant.</summary>
    public string WhatsAppWebhookSecret { get; set; } = string.Empty;
    public string SubscriptionChannel { get; set; } = "WhatsApp";
    public string SubscriptionCycle { get; set; } = "Monthly";
    public string SubscriptionStatus { get; set; } = "TrialActive";
    public decimal MonthlyPriceUsd { get; set; } = 120m;
    public decimal AnnualDiscountPercent { get; set; } = 15m;
    public int IncludedAppointmentsPerMonth { get; set; } = 250;
    public int IncludedConversationsPerMonth { get; set; } = 1000;
    public int IncludedDoctorSeats { get; set; } = 5;
    public decimal AddonRevenueUsd { get; set; } = 0m;
    public decimal OverageRevenueUsd { get; set; } = 0m;
    public DateTime? ActivatedAt { get; set; }
    public DateTime? LastActivityAt { get; set; }
    public DateTime? SubscriptionActivatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? SubscriptionExpiresAtUtc { get; set; } = DateTime.UtcNow.AddDays(3);

    public DateTime CreatedAt { get; set; }

    public bool IsOnline => LastActivityAt.HasValue && (DateTime.UtcNow - LastActivityAt.Value) <= OnlineWindow;
}

