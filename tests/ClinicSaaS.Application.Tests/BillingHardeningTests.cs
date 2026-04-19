using ClinicSaaS.Api.Services;

namespace ClinicSaaS.Application.Tests;

public sealed class BillingHardeningTests
{
    [Fact]
    public void CalculateProration_UpgradeMidCycle_ReturnsPositiveCharge()
    {
        var service = new SubscriptionService(null!, null!, null!);
        var value = service.CalculateProration(
            oldMonthlyPrice: 100m,
            newMonthlyPrice: 200m,
            cycleStartUtc: new DateTime(2026, 4, 1),
            cycleEndUtc: new DateTime(2026, 5, 1),
            changeAtUtc: new DateTime(2026, 4, 16));

        Assert.True(value > 0);
    }

    [Fact]
    public void CalculateProration_DowngradeMidCycle_ReturnsNegativeCredit()
    {
        var service = new SubscriptionService(null!, null!, null!);
        var value = service.CalculateProration(
            oldMonthlyPrice: 200m,
            newMonthlyPrice: 100m,
            cycleStartUtc: new DateTime(2026, 4, 1),
            cycleEndUtc: new DateTime(2026, 5, 1),
            changeAtUtc: new DateTime(2026, 4, 16));

        Assert.True(value < 0);
    }
}

