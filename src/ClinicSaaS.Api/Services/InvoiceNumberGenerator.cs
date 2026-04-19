using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class InvoiceNumberGenerator
{
    private readonly ClinicDbContext _db;

    public InvoiceNumberGenerator(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<(long Sequence, string Number)> NextAsync(CancellationToken cancellationToken)
    {
        var next = (await _db.Invoices.IgnoreQueryFilters().MaxAsync(x => (long?)x.InvoiceSequence, cancellationToken) ?? 0) + 1;
        return (next, $"INV-{DateTime.UtcNow:yyyy}-{next:D8}");
    }
}

