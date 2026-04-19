namespace ClinicSaaS.Application.Billing;

public static class PricingCalculator
{
    public static readonly IReadOnlyList<string> SupportedTiers = new[] { "Starter", "Growth", "Pro" };
    public static readonly IReadOnlyList<string> SupportedChannels = new[] { "WhatsApp", "Telegram" };

    public static decimal NormalizeDiscount(decimal discountPercent)
        => Math.Clamp(discountPercent, 0m, 80m);

    public static string NormalizeTier(string tier)
    {
        if (string.IsNullOrWhiteSpace(tier)) return "Growth";
        if (tier.Equals("Basic", StringComparison.OrdinalIgnoreCase) || tier.Equals("Starter", StringComparison.OrdinalIgnoreCase))
            return "Starter";
        if (tier.Equals("Business", StringComparison.OrdinalIgnoreCase) || tier.Equals("Growth", StringComparison.OrdinalIgnoreCase))
            return "Growth";
        if (tier.Equals("Enterprise", StringComparison.OrdinalIgnoreCase) || tier.Equals("Pro", StringComparison.OrdinalIgnoreCase))
            return "Pro";
        return "Growth";
    }

    public static string NormalizeChannel(string channel)
        => SupportedChannels.FirstOrDefault(x => x.Equals(channel, StringComparison.OrdinalIgnoreCase)) ?? "WhatsApp";

    public static decimal ResolveMonthlyBasePrice(string tier)
        => NormalizeTier(tier) switch
        {
            "Starter" => 79m,
            "Growth" => 169m,
            "Pro" => 349m,
            _ => 169m
        };

    public static decimal ResolveChannelFactor(string channel)
        => NormalizeChannel(channel) == "Telegram" ? 0.76m : 1m;

    public static decimal ResolveMonthlyPrice(string tier, string channel)
        => Math.Round(ResolveMonthlyBasePrice(tier) * ResolveChannelFactor(channel), 2, MidpointRounding.AwayFromZero);

    public static decimal CalculateAnnualPrice(decimal monthlyPrice, decimal discountPercent)
        => Math.Round((monthlyPrice * 12m) * (1m - (NormalizeDiscount(discountPercent) / 100m)), 2, MidpointRounding.AwayFromZero);

    public static (int Appointments, int Conversations, int Seats) ResolveIncludedLimits(string tier)
        => NormalizeTier(tier) switch
        {
            "Starter" => (600, 200, 1),
            "Growth" => (2500, 2000, 5),
            "Pro" => (10000, 999999, 999999),
            _ => (2500, 2000, 5)
        };

    public static decimal ResolveOveragePerAppointmentUsd(string tier)
        => NormalizeTier(tier) switch
        {
            "Starter" => 0.7m,
            "Growth" => 0.45m,
            "Pro" => 0.25m,
            _ => 0.45m
        };

    public static decimal ResolveOveragePerConversationUsd(string tier)
        => NormalizeTier(tier) switch
        {
            "Starter" => 0.06m,
            "Growth" => 0.04m,
            "Pro" => 0.02m,
            _ => 0.04m
        };

    public static decimal ResolveOveragePerSeatUsd(string tier)
        => NormalizeTier(tier) switch
        {
            "Starter" => 20m,
            "Growth" => 15m,
            "Pro" => 10m,
            _ => 15m
        };
}
