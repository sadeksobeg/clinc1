using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class BillingService
{
    private readonly ClinicDbContext _db;
    private readonly LedgerService _ledger;
    private readonly InvoiceNumberGenerator _invoiceNumbers;

    public BillingService(ClinicDbContext db, LedgerService ledger, InvoiceNumberGenerator invoiceNumbers)
    {
        _db = db;
        _ledger = ledger;
        _invoiceNumbers = invoiceNumbers;
    }

    public async Task<Invoice> IssueInvoiceAsync(Guid tenantId, Guid subscriptionId, decimal amount, PaymentMethodType method, string? reference, CancellationToken cancellationToken)
    {
        var next = await _invoiceNumbers.NextAsync(cancellationToken);
        var subtotal = amount;
        var tax = 0m;
        var discount = 0m;
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SubscriptionId = subscriptionId,
            InvoiceNumber = next.Number,
            InvoiceSequence = next.Sequence,
            Amount = amount,
            Subtotal = subtotal,
            Tax = tax,
            Discount = discount,
            Currency = "USD",
            Status = InvoiceStatus.Issued.ToString(),
            IssuedAtUtc = DateTime.UtcNow,
            DueDateUtc = DateTime.UtcNow.AddDays(7),
            PaymentMethod = method.ToString(),
            PaymentReference = reference
        };
        _db.Invoices.Add(invoice);
        _db.InvoiceLines.Add(new InvoiceLine
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            InvoiceId = invoice.Id,
            Description = "Subscription charge",
            Quantity = 1,
            UnitPrice = amount,
            Total = amount
        });
        await _db.SaveChangesAsync(cancellationToken);
        return invoice;
    }

    public async Task<(bool Changed, string Message)> ConfirmPaymentAsync(Guid invoiceId, Guid adminId, PaymentMethodType method, string? reference, CancellationToken cancellationToken, string? decisionReason = null, string? evidenceUrl = null)
    {
        var invoice = await _db.Invoices.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == invoiceId, cancellationToken);
        if (invoice is null) return (false, "Invoice not found.");
        if (invoice.Status == InvoiceStatus.Paid.ToString()) return (false, "Invoice already paid.");

        invoice.Status = InvoiceStatus.Paid.ToString();
        invoice.PaidAtUtc = DateTime.UtcNow;
        invoice.PaymentMethod = method.ToString();
        invoice.PaymentReference = string.IsNullOrWhiteSpace(reference) ? invoice.PaymentReference : reference.Trim();

        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            TenantId = invoice.TenantId,
            InvoiceId = invoice.Id,
            Method = method.ToString(),
            Reference = invoice.PaymentReference ?? string.Empty,
            Status = PaymentStatus.Confirmed.ToString(),
            Amount = invoice.Amount,
            EvidenceUrl = evidenceUrl ?? string.Empty,
            DecisionReason = decisionReason ?? string.Empty,
            ConfirmedByAdmin = adminId,
            ConfirmedAt = DateTime.UtcNow
        };
        _db.Payments.Add(payment);

        await _db.SaveChangesAsync(cancellationToken);
        await _ledger.PostPaymentAsync(invoice.TenantId, payment.Id, payment.Amount, cancellationToken);
        return (true, "Payment confirmed.");
    }

    public async Task<PaymentAttempt> RegisterPaymentAttemptAsync(Guid paymentId, Guid tenantId, PaymentStatus status, string? failureReason, string? gatewayResponse, CancellationToken cancellationToken)
    {
        var attempt = new PaymentAttempt
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            PaymentId = paymentId,
            Status = status.ToString(),
            FailureReason = failureReason ?? string.Empty,
            GatewayResponse = gatewayResponse ?? string.Empty
        };
        _db.PaymentAttempts.Add(attempt);
        await _db.SaveChangesAsync(cancellationToken);
        return attempt;
    }

    public async Task<BillingAdjustment> AddAdjustmentAsync(Guid tenantId, Guid subscriptionId, BillingAdjustmentType type, decimal amount, string reason, Guid approvedBy, CancellationToken cancellationToken)
    {
        var adjustment = new BillingAdjustment
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SubscriptionId = subscriptionId,
            Type = type.ToString(),
            Amount = amount,
            Reason = reason.Trim(),
            ApprovedBy = approvedBy,
            ApprovedAt = DateTime.UtcNow
        };
        _db.BillingAdjustments.Add(adjustment);
        await _db.SaveChangesAsync(cancellationToken);
        await _ledger.PostAdjustmentAsync(tenantId, adjustment.Id, amount, cancellationToken);
        return adjustment;
    }
}

