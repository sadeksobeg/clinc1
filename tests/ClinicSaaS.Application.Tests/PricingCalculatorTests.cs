using ClinicSaaS.Application.Billing;
using Xunit;

namespace ClinicSaaS.Application.Tests;

public sealed class PricingCalculatorTests
{
    [Fact]
    public void CalculateAnnualPrice_AppliesDiscountCorrectly()
    {
        var annual = PricingCalculator.CalculateAnnualPrice(120m, 15m);
        Assert.Equal(1224m, annual);
    }

    [Fact]
    public void ResolveMonthlyPrice_UsesTelegramRate()
    {
        Assert.Equal(128.44m, PricingCalculator.ResolveMonthlyPrice("Growth", "Telegram"));
    }

    [Fact]
    public void ResolveIncludedLimits_GrowthTier_ReturnsExpectedCaps()
    {
        var limits = PricingCalculator.ResolveIncludedLimits("Growth");
        Assert.Equal(2500, limits.Appointments);
        Assert.Equal(2000, limits.Conversations);
        Assert.Equal(5, limits.Seats);
    }

    [Fact]
    public void OverageRates_Pro_AreLowerThanStarter()
    {
        Assert.True(PricingCalculator.ResolveOveragePerAppointmentUsd("Pro") < PricingCalculator.ResolveOveragePerAppointmentUsd("Starter"));
        Assert.True(PricingCalculator.ResolveOveragePerConversationUsd("Pro") < PricingCalculator.ResolveOveragePerConversationUsd("Starter"));
        Assert.True(PricingCalculator.ResolveOveragePerSeatUsd("Pro") < PricingCalculator.ResolveOveragePerSeatUsd("Starter"));
    }
}
