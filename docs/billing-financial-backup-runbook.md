# Billing Financial Backup Runbook

## Scope
- Tables: `Invoices`, `InvoiceLines`, `Payments`, `BillingAdjustments`, `Wallets`, `WalletTransactions`, `LedgerAccounts`, `LedgerEntries`, `PredictionOutcomes`.

## Frequency
- Full backup: daily.
- Incremental backup: every 15 minutes.

## Integrity checks
- Verify paid invoices have payment rows.
- Verify debit/credit parity in `LedgerEntries`.
- Verify wallet balances vs wallet transactions.

## Restore drill
1. Restore latest full backup to staging.
2. Apply incrementals to target timestamp.
3. Run `financial_verification.sql`.
4. Execute smoke test on billing APIs.

