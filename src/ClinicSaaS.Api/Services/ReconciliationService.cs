using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class ReconciliationService
{
    private readonly ClinicDbContext _db;

    public ReconciliationService(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<ReconciliationReport> RunAsync(CancellationToken cancellationToken)
    {
        var paidInvoices = await _db.Invoices.IgnoreQueryFilters().AsNoTracking().Where(x => x.Status == "Paid").ToArrayAsync(cancellationToken);
        var payments = await _db.Payments.IgnoreQueryFilters().AsNoTracking().ToArrayAsync(cancellationToken);
        var wallets = await _db.Wallets.IgnoreQueryFilters().AsNoTracking().ToArrayAsync(cancellationToken);
        var ledger = await _db.LedgerEntries.IgnoreQueryFilters().AsNoTracking().ToArrayAsync(cancellationToken);

        var missingPayments = paidInvoices.Count(i => payments.All(p => p.InvoiceId != i.Id));
        var duplicateConfirmations = payments.GroupBy(x => x.InvoiceId).Count(g => g.Count() > 1);
        var walletMismatches = wallets.Count(w =>
        {
            var debit = ledger.Where(l => l.TenantId == w.TenantId && l.ReferenceType == "WalletTransaction" && l.EntryType == "Debit").Sum(x => x.Amount);
            var credit = ledger.Where(l => l.TenantId == w.TenantId && l.ReferenceType == "WalletTransaction" && l.EntryType == "Credit").Sum(x => x.Amount);
            return (debit - credit) != w.Balance;
        });
        return new ReconciliationReport(missingPayments, duplicateConfirmations, walletMismatches);
    }
}

public sealed record ReconciliationReport(int MissingPayments, int DuplicateConfirmations, int WalletLedgerMismatches);

