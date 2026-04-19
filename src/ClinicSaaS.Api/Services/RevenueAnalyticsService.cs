using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class RevenueAnalyticsService
{
    private readonly ClinicDbContext _db;

    public RevenueAnalyticsService(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<RevenueAnalyticsDto> GetAsync(CancellationToken cancellationToken)
    {
        var invoices = await _db.Invoices.IgnoreQueryFilters().AsNoTracking().ToArrayAsync(cancellationToken);
        var paid = invoices.Where(x => x.Status == "Paid").ToArray();
        var mrr = paid.Where(x => x.IssuedAtUtc >= DateTime.UtcNow.AddDays(-30)).Sum(x => x.Amount);
        var arr = mrr * 12m;
        var arpu = paid.Length == 0 ? 0m : Math.Round(paid.Sum(x => x.Amount) / paid.Length, 2);
        var expansion = paid.Where(x => x.Amount > 100).Sum(x => x.Amount);
        var churnRate = 0m;
        var ltv = arpu * 18m;
        return new RevenueAnalyticsDto(mrr, arr, arpu, expansion, churnRate, ltv, paid.Length);
    }
}

public sealed record RevenueAnalyticsDto(decimal Mrr, decimal Arr, decimal Arpu, decimal ExpansionRevenue, decimal ChurnRate, decimal Ltv, int PaidInvoicesCohort);

