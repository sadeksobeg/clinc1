using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class SubscriptionService
{
    private readonly ClinicDbContext _db;
    private readonly BillingService _billing;
    private readonly PlatformAuditService _audit;

    public SubscriptionService(ClinicDbContext db, BillingService billing, PlatformAuditService audit)
    {
        _db = db;
        _billing = billing;
        _audit = audit;
    }

    public async Task<Subscription> CreateRequestAsync(Guid tenantId, Guid planId, bool yearly, PaymentMethodType paymentMethod, string? paymentReference, Guid actorId, CancellationToken cancellationToken)
    {
        var existing = await _db.Subscriptions.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        var plan = await _db.Plans.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == planId && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("Plan not found.");
        var amount = yearly ? (plan.PriceYearly ?? (plan.PriceMonthly * 12)) : plan.PriceMonthly;

        if (existing is null)
        {
            existing = new Subscription
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                PlanId = planId,
                Status = SubscriptionLifecycleStatus.AwaitingPayment.ToString(),
                CreatedAt = DateTime.UtcNow,
                IsTrial = false
            };
            _db.Subscriptions.Add(existing);
        }
        else
        {
            if (existing.Status is nameof(SubscriptionLifecycleStatus.AwaitingPayment) or nameof(SubscriptionLifecycleStatus.Requested))
                throw new InvalidOperationException("Pending subscription request already exists.");
            existing.PlanId = planId;
            existing.Status = SubscriptionLifecycleStatus.AwaitingPayment.ToString();
            existing.IsTrial = false;
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _billing.IssueInvoiceAsync(tenantId, existing.Id, amount, paymentMethod, paymentReference, cancellationToken);
        await _audit.LogAsync("SubscriptionRequested", actorId, "Subscription", existing.Id.ToString(), cancellationToken);
        return existing;
    }

    public async Task GrantTrialAsync(Guid tenantId, Guid planId, int days, Guid adminId, CancellationToken cancellationToken)
    {
        var subscription = await EnsureSubscriptionAsync(tenantId, planId, cancellationToken);
        subscription.Status = SubscriptionLifecycleStatus.Trial.ToString();
        subscription.IsTrial = true;
        subscription.TrialEndsAt = DateTime.UtcNow.AddDays(days);
        subscription.StartDate = DateTime.UtcNow;
        subscription.EndDate = subscription.TrialEndsAt;
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("TrialGranted", adminId, "Subscription", subscription.Id.ToString(), cancellationToken);
    }

    public async Task<(bool Changed, string Message)> ActivateFromInvoiceAsync(Guid invoiceId, Guid adminId, CancellationToken cancellationToken)
    {
        var invoice = await _db.Invoices.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == invoiceId, cancellationToken);
        if (invoice is null) return (false, "Invoice not found.");
        var subscription = await _db.Subscriptions.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == invoice.SubscriptionId, cancellationToken);
        if (subscription is null) return (false, "Subscription not found.");

        if (subscription.Status == SubscriptionLifecycleStatus.Active.ToString()) return (false, "Subscription already active.");
        if (invoice.Status != InvoiceStatus.Paid.ToString()) return (false, "Invoice is not paid.");

        var plan = await _db.Plans.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == subscription.PlanId, cancellationToken);
        if (plan is null) return (false, "Plan not found.");

        var now = DateTime.UtcNow;
        subscription.Status = SubscriptionLifecycleStatus.Active.ToString();
        subscription.StartDate = now;
        subscription.EndDate = now.AddMonths(1);
        subscription.IsTrial = false;
        subscription.TrialEndsAt = null;
        await _db.SaveChangesAsync(cancellationToken);

        _db.BillingPeriods.Add(new BillingPeriod
        {
            Id = Guid.NewGuid(),
            TenantId = subscription.TenantId,
            SubscriptionId = subscription.Id,
            StartsAt = now,
            EndsAt = subscription.EndDate.Value,
            IsCurrent = true
        });
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("SubscriptionActivated", adminId, "Subscription", subscription.Id.ToString(), cancellationToken);
        return (true, "Subscription activated.");
    }

    public async Task ProcessExpiryAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var subscriptions = await _db.Subscriptions.IgnoreQueryFilters()
            .Where(x =>
                (x.Status == SubscriptionLifecycleStatus.Trial.ToString() && x.TrialEndsAt.HasValue && x.TrialEndsAt <= now) ||
                (x.Status == SubscriptionLifecycleStatus.Active.ToString() && x.EndDate.HasValue && x.EndDate <= now))
            .ToArrayAsync(cancellationToken);

        foreach (var item in subscriptions)
        {
            item.Status = SubscriptionLifecycleStatus.Suspended.ToString();
            item.GraceEndsAt = now.AddDays(3);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task FinalizePeriodAsync(Guid subscriptionId, CancellationToken cancellationToken)
    {
        var current = await _db.BillingPeriods.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.SubscriptionId == subscriptionId && x.IsCurrent, cancellationToken);
        if (current is null || current.IsFinalized)
            return;
        current.IsFinalized = true;
        current.IsCurrent = false;
        current.ClosedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public decimal CalculateProration(decimal oldMonthlyPrice, decimal newMonthlyPrice, DateTime cycleStartUtc, DateTime cycleEndUtc, DateTime changeAtUtc)
    {
        var totalDays = Math.Max(1, (cycleEndUtc - cycleStartUtc).TotalDays);
        var remainingDays = Math.Max(0, (cycleEndUtc - changeAtUtc).TotalDays);
        var credit = oldMonthlyPrice * (decimal)(remainingDays / totalDays);
        var charge = newMonthlyPrice * (decimal)(remainingDays / totalDays);
        return Math.Round(charge - credit, 2);
    }

    public async Task<(bool Changed, string Message)> ChangePlanAsync(Guid tenantId, Guid targetPlanId, bool immediateUpgrade, Guid actorId, CancellationToken cancellationToken)
    {
        var subscription = await _db.Subscriptions.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        if (subscription is null) return (false, "Subscription not found.");
        var currentPlan = await _db.Plans.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == subscription.PlanId, cancellationToken);
        var targetPlan = await _db.Plans.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == targetPlanId && x.IsActive, cancellationToken);
        if (currentPlan is null || targetPlan is null) return (false, "Plan not found.");
        if (currentPlan.Id == targetPlan.Id) return (false, "Already on target plan.");

        if (immediateUpgrade && targetPlan.PriceMonthly >= currentPlan.PriceMonthly)
        {
            var cycleStart = subscription.StartDate ?? DateTime.UtcNow;
            var cycleEnd = subscription.EndDate ?? DateTime.UtcNow.AddMonths(1);
            var proration = CalculateProration(currentPlan.PriceMonthly, targetPlan.PriceMonthly, cycleStart, cycleEnd, DateTime.UtcNow);
            subscription.PlanId = targetPlan.Id;
            await _db.SaveChangesAsync(cancellationToken);
            if (proration > 0)
                await _billing.IssueInvoiceAsync(tenantId, subscription.Id, proration, PaymentMethodType.Cash, "proration-upgrade", cancellationToken);
            await _audit.LogAsync("SubscriptionUpgraded", actorId, "Subscription", subscription.Id.ToString(), cancellationToken);
            return (true, "Plan upgraded.");
        }

        subscription.PendingPlanId = targetPlan.Id;
        subscription.DowngradeEffectiveAt = subscription.EndDate ?? DateTime.UtcNow.AddMonths(1);
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("SubscriptionDowngradeScheduled", actorId, "Subscription", subscription.Id.ToString(), cancellationToken);
        return (true, "Downgrade scheduled.");
    }

    private async Task<Subscription> EnsureSubscriptionAsync(Guid tenantId, Guid planId, CancellationToken cancellationToken)
    {
        var existing = await _db.Subscriptions.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        if (existing is not null)
        {
            existing.PlanId = planId;
            return existing;
        }

        var created = new Subscription
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            PlanId = planId,
            Status = SubscriptionLifecycleStatus.Requested.ToString(),
            CreatedAt = DateTime.UtcNow
        };
        _db.Subscriptions.Add(created);
        await _db.SaveChangesAsync(cancellationToken);
        return created;
    }
}

