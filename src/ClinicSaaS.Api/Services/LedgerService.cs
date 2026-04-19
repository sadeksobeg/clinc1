using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class LedgerService
{
    private readonly ClinicDbContext _db;

    public LedgerService(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task PostPaymentAsync(Guid tenantId, Guid paymentId, decimal amount, CancellationToken cancellationToken)
    {
        var cash = await EnsureAccountAsync(tenantId, "CASH", "Cash", cancellationToken);
        var ar = await EnsureAccountAsync(tenantId, "AR", "Accounts Receivable", cancellationToken);
        await PostDoubleEntryAsync(tenantId, cash.Id, ar.Id, amount, "Payment", paymentId.ToString(), cancellationToken);
    }

    public async Task PostAdjustmentAsync(Guid tenantId, Guid adjustmentId, decimal amount, CancellationToken cancellationToken)
    {
        var adj = await EnsureAccountAsync(tenantId, "ADJ", "Billing Adjustments", cancellationToken);
        var ar = await EnsureAccountAsync(tenantId, "AR", "Accounts Receivable", cancellationToken);
        await PostDoubleEntryAsync(tenantId, adj.Id, ar.Id, amount, "Adjustment", adjustmentId.ToString(), cancellationToken);
    }

    public async Task PostWalletAsync(Guid tenantId, Guid txId, decimal amount, CancellationToken cancellationToken)
    {
        var wallet = await EnsureAccountAsync(tenantId, "WALLET", "Credit Wallet", cancellationToken);
        var cash = await EnsureAccountAsync(tenantId, "CASH", "Cash", cancellationToken);
        await PostDoubleEntryAsync(tenantId, cash.Id, wallet.Id, amount, "WalletTransaction", txId.ToString(), cancellationToken);
    }

    private async Task PostDoubleEntryAsync(Guid tenantId, Guid debitAccountId, Guid creditAccountId, decimal amount, string referenceType, string referenceId, CancellationToken cancellationToken)
    {
        if (amount <= 0) return;
        _db.LedgerEntries.Add(new LedgerEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AccountId = debitAccountId,
            EntryType = LedgerEntryType.Debit.ToString(),
            Amount = amount,
            ReferenceType = referenceType,
            ReferenceId = referenceId
        });
        _db.LedgerEntries.Add(new LedgerEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AccountId = creditAccountId,
            EntryType = LedgerEntryType.Credit.ToString(),
            Amount = amount,
            ReferenceType = referenceType,
            ReferenceId = referenceId
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<LedgerAccount> EnsureAccountAsync(Guid tenantId, string code, string name, CancellationToken cancellationToken)
    {
        var account = await _db.LedgerAccounts.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.TenantId == tenantId && x.Code == code, cancellationToken);
        if (account is not null) return account;
        account = new LedgerAccount { Id = Guid.NewGuid(), TenantId = tenantId, Code = code, Name = name };
        _db.LedgerAccounts.Add(account);
        await _db.SaveChangesAsync(cancellationToken);
        return account;
    }
}

