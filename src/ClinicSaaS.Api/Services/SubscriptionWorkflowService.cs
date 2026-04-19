using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ClinicSaaS.Application.Billing;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Services;

public sealed class SubscriptionWorkflowService
{
    private readonly ClinicDbContext _db;
    private readonly PlatformAuditService _audit;

    public SubscriptionWorkflowService(ClinicDbContext db, PlatformAuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    public async Task<WorkflowResult> ApproveRequestAsync(Guid requestId, string? note, Guid? actorUserId, CancellationToken cancellationToken)
    {
        var request = await _db.SubscriptionRequests.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == requestId, cancellationToken);
        if (request is null) return WorkflowResult.NotFound("Request not found.");

        if (IsFinalized(ParseRequestStatus(request.Status)))
            return WorkflowResult.BadRequest("Request already finalized.");

        await UpdateRequestStateAsync(request, SubscriptionRequestStatus.AwaitingPayment, note, actorUserId, cancellationToken);
        await AuditAsync("SubscriptionApproved", "SubscriptionRequest", requestId.ToString(), actorUserId, cancellationToken);
        return WorkflowResult.Ok();
    }

    public async Task<WorkflowResult> ConfirmPaymentAsync(Guid requestId, string paymentMethod, string? paymentReference, string? note, Guid? actorUserId, CancellationToken cancellationToken)
    {
        var request = await _db.SubscriptionRequests.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == requestId, cancellationToken);
        if (request is null) return WorkflowResult.NotFound("Request not found.");

        var current = ParseRequestStatus(request.Status);
        if (current != SubscriptionRequestStatus.AwaitingPayment && current != SubscriptionRequestStatus.Requested)
            return WorkflowResult.BadRequest("Request is not in payment stage.");

        var normalized = NormalizePaymentMethod(paymentMethod);
        if (normalized is null) return WorkflowResult.BadRequest("PaymentMethod must be Cash or ShamCash.");

        request.PaymentReference = paymentReference?.Trim() ?? request.PaymentReference;
        request.Notes = $"[PaymentMethod:{normalized}] {(note ?? string.Empty)}".Trim();

        var invoice = BuildInvoiceFromPayment(request);
        _db.Invoices.Add(invoice);
        _db.InvoiceLines.AddRange(BuildInvoiceLines(invoice, request));

        await UpdateRequestStateAsync(request, SubscriptionRequestStatus.PaymentConfirmed, note, actorUserId, cancellationToken);
        await AuditAsync("SubscriptionPaymentConfirmed", "SubscriptionRequest", requestId.ToString(), actorUserId, cancellationToken);
        return WorkflowResult.Ok();
    }

    public async Task<WorkflowResult> ActivateAsync(Guid requestId, string? note, Guid? actorUserId, CancellationToken cancellationToken)
    {
        var request = await _db.SubscriptionRequests.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == requestId, cancellationToken);
        if (request is null) return WorkflowResult.NotFound("Request not found.");
        if (ParseRequestStatus(request.Status) != SubscriptionRequestStatus.PaymentConfirmed)
            return WorkflowResult.BadRequest("Request is not payment-confirmed.");

        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken);
        if (tenant is null) return WorkflowResult.NotFound("Tenant not found.");

        var now = DateTime.UtcNow;
        tenant.SubscriptionStatus = TenantSubscriptionState.Active.ToString();
        tenant.SubscriptionPlan = request.PlanTier;
        tenant.SubscriptionChannel = request.Channel;
        tenant.SubscriptionCycle = request.Cycle;
        tenant.MonthlyPriceUsd = request.MonthlyPriceUsd;
        tenant.AnnualDiscountPercent = request.AnnualDiscountPercent;
        tenant.ActivatedAt ??= now;
        tenant.SubscriptionActivatedAtUtc = now;
        tenant.SubscriptionExpiresAtUtc = request.Cycle == "Annual" ? now.AddYears(1) : now.AddMonths(1);

        var limits = PricingCalculator.ResolveIncludedLimits(request.PlanTier);
        tenant.IncludedAppointmentsPerMonth = limits.Appointments;
        tenant.IncludedConversationsPerMonth = limits.Conversations;
        tenant.IncludedDoctorSeats = limits.Seats;

        await UpdateRequestStateAsync(request, SubscriptionRequestStatus.Activated, note, actorUserId, cancellationToken);
        await AuditAsync("SubscriptionActivated", "SubscriptionRequest", requestId.ToString(), actorUserId, cancellationToken);
        return WorkflowResult.Ok();
    }

    public async Task<WorkflowResult> RejectAsync(Guid requestId, string? note, Guid? actorUserId, CancellationToken cancellationToken)
    {
        var request = await _db.SubscriptionRequests.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == requestId, cancellationToken);
        if (request is null) return WorkflowResult.NotFound("Request not found.");
        if (IsFinalized(ParseRequestStatus(request.Status)))
            return WorkflowResult.BadRequest("Request already finalized.");

        await UpdateRequestStateAsync(request, SubscriptionRequestStatus.Rejected, note, actorUserId, cancellationToken);
        await AuditAsync("SubscriptionRejected", "SubscriptionRequest", requestId.ToString(), actorUserId, cancellationToken);
        return WorkflowResult.Ok();
    }

    public async Task<WorkflowResult> SuspendTenantAsync(Guid tenantId, Guid? actorUserId, CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);
        if (tenant is null) return WorkflowResult.NotFound("Clinic not found.");
        tenant.SubscriptionStatus = TenantSubscriptionState.Suspended.ToString();
        await _db.SaveChangesAsync(cancellationToken);
        await AuditAsync("ClinicSuspended", "Tenant", tenantId.ToString(), actorUserId, cancellationToken);
        return WorkflowResult.Ok();
    }

    public async Task<WorkflowResult> CancelSubscriptionAsync(Guid tenantId, string? note, Guid? actorUserId, CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);
        if (tenant is null) return WorkflowResult.NotFound("Clinic not found.");
        tenant.SubscriptionStatus = TenantSubscriptionState.Cancelled.ToString();
        await _db.SaveChangesAsync(cancellationToken);
        await AuditAsync("SubscriptionCancelled", "Tenant", tenantId.ToString(), actorUserId, cancellationToken);

        if (!string.IsNullOrWhiteSpace(note))
        {
            _db.SubscriptionAuditLogs.Add(new SubscriptionAuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                Action = "SubscriptionCancelled",
                Details = note.Trim(),
                ActorUserId = actorUserId,
                CreatedAtUtc = DateTime.UtcNow
            });
            await _db.SaveChangesAsync(cancellationToken);
        }

        return WorkflowResult.Ok();
    }

    public static Guid? ResolveActorUserId(ClaimsPrincipal user)
    {
        var sub = user.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return Guid.TryParse(sub, out var userId) ? userId : null;
    }

    private static string? NormalizePaymentMethod(string? paymentMethod)
    {
        if (string.IsNullOrWhiteSpace(paymentMethod)) return null;
        var normalized = paymentMethod.Trim().ToLowerInvariant();
        if (normalized == "cash") return "Cash";
        if (normalized is "shamcash" or "sham_cash" or "sham-cash") return "ShamCash";
        return null;
    }

    private static SubscriptionRequestStatus ParseRequestStatus(string? value)
        => Enum.TryParse<SubscriptionRequestStatus>(value, true, out var parsed) ? parsed : SubscriptionRequestStatus.Requested;

    private static bool IsFinalized(SubscriptionRequestStatus status)
        => status is SubscriptionRequestStatus.Rejected or SubscriptionRequestStatus.Activated;

    private async Task UpdateRequestStateAsync(SubscriptionRequest request, SubscriptionRequestStatus newState, string? note, Guid? actorUserId, CancellationToken cancellationToken)
    {
        var previous = request.Status;
        request.Status = newState.ToString();
        request.DecisionReason = note?.Trim();
        request.ReviewedAtUtc = DateTime.UtcNow;
        request.ReviewedByUserId = actorUserId;

        _db.SubscriptionRequestStatusHistory.Add(new SubscriptionRequestStatusHistory
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            SubscriptionRequestId = request.Id,
            FromStatus = previous,
            ToStatus = newState.ToString(),
            Note = note?.Trim() ?? string.Empty,
            ChangedByUserId = actorUserId,
            CreatedAtUtc = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task AuditAsync(string action, string entityType, string entityId, Guid? actorUserId, CancellationToken cancellationToken)
    {
        if (!actorUserId.HasValue || actorUserId == Guid.Empty) return;
        await _audit.LogAsync(action, actorUserId.Value, entityType, entityId, cancellationToken);
    }

    private static Invoice BuildInvoiceFromPayment(SubscriptionRequest request)
    {
        var subtotal = request.FinalPriceUsd;
        var tax = 0m;
        var total = subtotal + tax;

        return new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            SubscriptionRequestId = request.Id,
            InvoiceNumber = $"INV-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
            Status = "Issued",
            SubtotalUsd = subtotal,
            TaxUsd = tax,
            TotalUsd = total,
            Currency = "USD",
            PaymentEvidenceReference = request.PaymentReference,
            Notes = request.Notes,
            IssuedAtUtc = DateTime.UtcNow
        };
    }

    private static IEnumerable<InvoiceLine> BuildInvoiceLines(Invoice invoice, SubscriptionRequest request)
    {
        yield return new InvoiceLine
        {
            Id = Guid.NewGuid(),
            TenantId = invoice.TenantId,
            InvoiceId = invoice.Id,
            Code = $"PLAN-{request.PlanTier.ToUpperInvariant()}",
            Description = $"{request.PlanTier} {request.Channel}/{request.Cycle}",
            Quantity = 1,
            UnitPriceUsd = request.FinalPriceUsd,
            LineTotalUsd = request.FinalPriceUsd
        };
    }

    public sealed record WorkflowResult(int StatusCode, string? Error)
    {
        public static WorkflowResult Ok() => new(StatusCodes.Status200OK, null);
        public static WorkflowResult NotFound(string message) => new(StatusCodes.Status404NotFound, message);
        public static WorkflowResult BadRequest(string message) => new(StatusCodes.Status400BadRequest, message);
    }
}
