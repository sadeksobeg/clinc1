using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class DunningService
{
    private readonly ClinicDbContext _db;

    public DunningService(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<int> RunAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var unpaid = await _db.Invoices.IgnoreQueryFilters()
            .Where(x => x.Status != InvoiceStatus.Paid.ToString() && x.DueDateUtc < now)
            .ToArrayAsync(cancellationToken);
        var touched = 0;
        foreach (var invoice in unpaid)
        {
            var days = (now - invoice.DueDateUtc).Days;
            var sub = await _db.Subscriptions.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == invoice.SubscriptionId, cancellationToken);
            if (sub is null) continue;
            touched++;
            if (days >= 7) sub.Status = SubscriptionLifecycleStatus.Suspended.ToString();
            else if (days >= 5) sub.GraceEndsAt = now;
            else if (days >= 3 && sub.GraceEndsAt is null) sub.GraceEndsAt = now.AddDays(2);
        }
        await _db.SaveChangesAsync(cancellationToken);
        return touched;
    }
}

