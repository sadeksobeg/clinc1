using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicSaaS.Api.Auth;
using ClinicSaaS.Api.Services;
using ClinicSaaS.Application.Billing;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Domain.Subscriptions;
using ClinicSaaS.Domain.WorkingHours;
using ClinicSaaS.Infrastructure.Persistence;
using ClinicSaaS.Infrastructure.Webhooks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/platform")]
[Authorize(Policy = "PlatformOnly")]
[EnableRateLimiting("platform")]
public sealed class PlatformController : ControllerBase
{
    private static readonly TimeSpan OnlineWindow = TimeSpan.FromMinutes(2);
    private static readonly DateTime ProcessStartedAtUtc = DateTime.UtcNow;
    private readonly ClinicDbContext _db;
    private readonly PlatformAuditService _audit;
    private readonly SubscriptionWorkflowService _workflow;
    private readonly WorkerHeartbeatService _heartbeats;
    private readonly PresenceService _presence;
    private readonly UserManager<ApplicationUser> _identityUsers;
    private readonly OperationalMetricsService _metrics;
    private readonly WebhookDeadLetterStore _deadLetters;

    public PlatformController(ClinicDbContext db, PlatformAuditService audit, SubscriptionWorkflowService workflow, WorkerHeartbeatService heartbeats, PresenceService presence, UserManager<ApplicationUser> identityUsers, OperationalMetricsService metrics, WebhookDeadLetterStore deadLetters)
    {
        _db = db;
        _audit = audit;
        _workflow = workflow;
        _heartbeats = heartbeats;
        _presence = presence;
        _identityUsers = identityUsers;
        _metrics = metrics;
        _deadLetters = deadLetters;
    }

    [HttpGet("online-users")]
    public async Task<ActionResult<OnlineUsersResponse>> OnlineUsers(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var users = await _db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => !u.IsDisabled && u.TenantId != Guid.Empty)
            .Select(u => new { u.Id, u.FullName, u.Email, u.Role, u.TenantId, u.LastSeenAt })
            .ToArrayAsync(cancellationToken);

        var tenants = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Select(t => new { t.Id, t.Name })
            .ToDictionaryAsync(t => t.Id, t => t.Name, cancellationToken);

        var grouped = users
            .GroupBy(u => u.TenantId)
            .Select(g =>
            {
                var doctors = g
                    .Where(x => x.Role == UserRole.Doctor)
                    .Select(x => new
                    {
                        x.Id,
                        x.FullName,
                        x.Email,
                        LastSeenAt = _presence.TryGetLastSeen(x.Id) ?? x.LastSeenAt
                    })
                    .Where(x => IsOnline(x.LastSeenAt, now))
                    .Select(x => new OnlineUserItem(x.Id, FullNameOrFallback(x.FullName, x.Email), x.Email, x.LastSeenAt))
                    .ToArray();
                var receptionists = g
                    .Where(x => x.Role == UserRole.Receptionist)
                    .Select(x => new
                    {
                        x.Id,
                        x.FullName,
                        x.Email,
                        LastSeenAt = _presence.TryGetLastSeen(x.Id) ?? x.LastSeenAt
                    })
                    .Where(x => IsOnline(x.LastSeenAt, now))
                    .Select(x => new OnlineUserItem(x.Id, FullNameOrFallback(x.FullName, x.Email), x.Email, x.LastSeenAt))
                    .ToArray();
                return new OnlineUsersByClinic(
                    g.Key,
                    tenants.TryGetValue(g.Key, out var name) ? name : "Unknown",
                    doctors,
                    receptionists);
            })
            .OrderBy(x => x.ClinicName)
            .ToArray();

        return Ok(new OnlineUsersResponse(grouped));
    }

    [HttpGet("clinics")]
    public async Task<ActionResult<IReadOnlyList<PlatformClinicDto>>> Clinics(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var tenants = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().OrderBy(t => t.Name).ToArrayAsync(cancellationToken);
        var doctorsByTenant = await _db.Doctors.IgnoreQueryFilters().AsNoTracking()
            .GroupBy(x => x.TenantId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        var receptionByTenant = await _db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.Role == UserRole.Receptionist && !u.IsDisabled)
            .GroupBy(x => x.TenantId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        var onlineByTenant = await _db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.TenantId != Guid.Empty && !u.IsDisabled && u.LastSeenAt.HasValue && u.LastSeenAt > now - OnlineWindow)
            .GroupBy(x => x.TenantId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var list = tenants.Select(t => new PlatformClinicDto(
            t.Id,
            t.Name,
            t.Country,
            t.SubscriptionStatus,
            t.SubscriptionPlan,
            t.ActivatedAt ?? t.SubscriptionActivatedAtUtc,
            t.LastActivityAt,
            IsOnline(t.LastActivityAt, now),
            doctorsByTenant.GetValueOrDefault(t.Id, 0),
            receptionByTenant.GetValueOrDefault(t.Id, 0),
            onlineByTenant.GetValueOrDefault(t.Id, 0),
            t.CreatedAt))
            .ToArray();

        return Ok(list);
    }

    [HttpPost("clinics")]
    public async Task<ActionResult<PlatformClinicDto>> CreateClinic([FromBody] CreateClinicRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("Clinic name is required.");

        var channel = PricingCalculator.NormalizeChannel(request.Channel);
        var tier = PricingCalculator.NormalizeTier(request.SubscriptionPlan);
        var cycle = request.Cycle?.Equals("Annual", StringComparison.OrdinalIgnoreCase) == true ? "Annual" : "Monthly";
        var now = DateTime.UtcNow;

        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Country = request.Country?.Trim() ?? string.Empty,
            TimeZoneId = string.IsNullOrWhiteSpace(request.TimeZoneId) ? "Asia/Baghdad" : request.TimeZoneId.Trim(),
            SubscriptionStatus = "Pending",
            SubscriptionPlan = tier,
            SubscriptionChannel = channel,
            SubscriptionCycle = cycle,
            MonthlyPriceUsd = PricingCalculator.ResolveMonthlyPrice(tier, channel),
            AnnualDiscountPercent = 15m,
            CreatedAt = now
        };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync(cancellationToken);
        await LogAsync("ClinicCreated", "Tenant", tenant.Id.ToString(), cancellationToken);

        return Ok(new PlatformClinicDto(
            tenant.Id,
            tenant.Name,
            tenant.Country,
            tenant.SubscriptionStatus,
            tenant.SubscriptionPlan,
            tenant.ActivatedAt,
            tenant.LastActivityAt,
            false,
            0,
            0,
            0,
            tenant.CreatedAt));
    }

    [HttpPost("clinics/{tenantId:guid}/suspend")]
    public async Task<ActionResult> SuspendClinic(Guid tenantId, CancellationToken cancellationToken)
    {
        var result = await _workflow.SuspendTenantAsync(tenantId, GetActorId(), cancellationToken);
        if (result.Error is not null) return StatusCode(result.StatusCode, result.Error);
        return Ok();
    }

    [HttpPost("clinics/{tenantId:guid}/reactivate")]
    public async Task<ActionResult> ReactivateClinic(Guid tenantId, CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);
        if (tenant is null) return NotFound("Clinic not found.");
        tenant.SubscriptionStatus = TenantSubscriptionState.Active.ToString();
        tenant.ActivatedAt ??= DateTime.UtcNow;
        tenant.SubscriptionActivatedAtUtc = tenant.ActivatedAt;
        await _db.SaveChangesAsync(cancellationToken);
        await LogAsync("ClinicReactivated", "Tenant", tenantId.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("clinics/{tenantId:guid}/view-workspace")]
    public ActionResult<ViewWorkspaceResponse> ViewWorkspace(Guid tenantId)
        => Ok(new ViewWorkspaceResponse(tenantId, "/clinic/reception"));

    [HttpGet("users")]
    public async Task<ActionResult<IReadOnlyList<PlatformUserDto>>> Users([FromQuery] string? role, CancellationToken cancellationToken)
    {
        UserRole? parsedRole = null;
        if (!string.IsNullOrWhiteSpace(role))
        {
            if (!Enum.TryParse<UserRole>(role, true, out var value) || value == UserRole.PlatformAdmin)
                return BadRequest("Role must be Doctor or Receptionist.");
            parsedRole = value;
        }

        var query = _db.Users.IgnoreQueryFilters().AsNoTracking().Where(x => x.TenantId != Guid.Empty);
        if (parsedRole.HasValue) query = query.Where(x => x.Role == parsedRole.Value);

        var tenants = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);
        var users = await query.OrderByDescending(x => x.CreatedAt).ToArrayAsync(cancellationToken);
        var now = DateTime.UtcNow;

        return Ok(users.Select(u => new PlatformUserDto(
            u.Id,
            u.FullName,
            u.Email,
            u.Role.ToString(),
            u.TenantId,
            tenants.GetValueOrDefault(u.TenantId, "Unknown"),
            IsOnline(u.LastSeenAt, now),
            u.LastSeenAt,
            u.CreatedAt,
            u.IsDisabled)).ToArray());
    }

    [HttpPost("users/{userId:guid}/disable")]
    public async Task<ActionResult> DisableUser(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return NotFound("User not found.");
        user.IsDisabled = true;
        user.IsOnline = false;
        var identity = await _identityUsers.Users.FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (identity is not null)
        {
            identity.IsActive = false;
            await _identityUsers.UpdateAsync(identity);
        }
        await _db.SaveChangesAsync(cancellationToken);
        await LogAsync("UserDisabled", "User", userId.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("users/{userId:guid}/reset-password")]
    public async Task<ActionResult<ResetPasswordResponse>> ResetPassword(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return NotFound("User not found.");
        var temporaryPassword = GenerateTemporaryPassword();
        user.PasswordHash = PasswordHasher.HashPassword(temporaryPassword);
        var identity = await _identityUsers.Users.FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (identity is not null)
        {
            var token = await _identityUsers.GeneratePasswordResetTokenAsync(identity);
            var reset = await _identityUsers.ResetPasswordAsync(identity, token, temporaryPassword);
            if (!reset.Succeeded)
                return BadRequest(string.Join(" | ", reset.Errors.Select(x => x.Description)));
        }
        await _db.SaveChangesAsync(cancellationToken);
        await LogAsync("UserPasswordReset", "User", userId.ToString(), cancellationToken);
        return Ok(new ResetPasswordResponse(user.Id, user.Email, temporaryPassword));
    }

    [HttpGet("subscriptions-legacy")]
    public async Task<ActionResult<IReadOnlyList<PlatformSubscriptionDto>>> SubscriptionPipeline(CancellationToken cancellationToken)
    {
        var tenantPlans = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .ToDictionaryAsync(x => x.Id, x => x.SubscriptionPlan, cancellationToken);
        var rows = await _db.SubscriptionRequests.IgnoreQueryFilters().AsNoTracking()
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(300)
            .Select(x => new
            {
                x.Id,
                x.TenantId,
                x.ClinicName,
                x.RequestedByDoctorName,
                x.RequestedByDoctorEmail,
                x.PlanTier,
                x.Channel,
                x.Cycle,
                x.Status,
                x.FinalPriceUsd,
                x.PaymentReference,
                x.CreatedAtUtc,
                x.ReviewedAtUtc,
                x.DecisionReason
            })
            .ToArrayAsync(cancellationToken);
        var items = rows.Select(x =>
        {
            var currentPlan = tenantPlans.GetValueOrDefault(x.TenantId, "Unknown");
            return new PlatformSubscriptionDto(
                x.Id,
                x.TenantId,
                x.ClinicName,
                x.RequestedByDoctorName,
                x.RequestedByDoctorEmail,
                x.PlanTier,
                x.Channel,
                x.Cycle,
                x.Status,
                DetectRequestType(currentPlan, x.PlanTier),
                BuildChangeSummary(currentPlan, x.PlanTier, x.Channel, x.Cycle),
                x.FinalPriceUsd,
                x.PaymentReference,
                x.CreatedAtUtc,
                x.ReviewedAtUtc,
                x.DecisionReason);
        }).ToArray();
        return Ok(items);
    }

    [HttpGet("billing/invoices")]
    public async Task<ActionResult<IReadOnlyList<PlatformInvoiceDto>>> BillingInvoices(CancellationToken cancellationToken)
    {
        var tenants = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);
        var items = await _db.Invoices.IgnoreQueryFilters().AsNoTracking()
            .OrderByDescending(x => x.IssuedAtUtc)
            .Take(300)
            .Select(x => new PlatformInvoiceDto(
                x.Id,
                x.TenantId,
                string.Empty,
                x.InvoiceNumber,
                x.Status,
                x.TotalUsd,
                x.IssuedAtUtc,
                x.PaidAtUtc))
            .ToArrayAsync(cancellationToken);
        return Ok(items.Select(x => x with { TenantName = tenants.GetValueOrDefault(x.TenantId, x.TenantId.ToString()) }).ToArray());
    }

    [HttpPost("billing/invoices/{invoiceId:guid}/mark-paid")]
    public async Task<ActionResult> MarkInvoicePaid(Guid invoiceId, CancellationToken cancellationToken)
    {
        var invoice = await _db.Invoices.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == invoiceId, cancellationToken);
        if (invoice is null) return NotFound("Invoice not found.");
        invoice.Status = "Paid";
        invoice.PaidAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        await LogAsync("InvoiceMarkedPaid", "Invoice", invoiceId.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("subscriptions-legacy/{requestId:guid}/approve")]
    public async Task<ActionResult> ApproveSubscription(Guid requestId, [FromBody] DecisionRequest body, CancellationToken cancellationToken)
    {
        var result = await _workflow.ApproveRequestAsync(requestId, body.Note, GetActorId(), cancellationToken);
        if (result.Error is not null) return StatusCode(result.StatusCode, result.Error);
        return Ok();
    }

    [HttpPost("subscriptions-legacy/{requestId:guid}/confirm-payment")]
    public async Task<ActionResult> ConfirmPayment(Guid requestId, [FromBody] PaymentConfirmRequest body, CancellationToken cancellationToken)
    {
        var result = await _workflow.ConfirmPaymentAsync(requestId, body.PaymentMethod, body.PaymentReference, body.Note, GetActorId(), cancellationToken);
        if (result.Error is not null) return StatusCode(result.StatusCode, result.Error);
        return Ok();
    }

    [HttpPost("subscriptions-legacy/{requestId:guid}/activate")]
    public async Task<ActionResult> ActivateSubscription(Guid requestId, [FromBody] DecisionRequest body, CancellationToken cancellationToken)
    {
        var result = await _workflow.ActivateAsync(requestId, body.Note, GetActorId(), cancellationToken);
        if (result.Error is not null) return StatusCode(result.StatusCode, result.Error);
        return Ok();
    }

    [HttpPost("subscriptions-legacy/{requestId:guid}/reject")]
    public async Task<ActionResult> RejectSubscription(Guid requestId, [FromBody] DecisionRequest body, CancellationToken cancellationToken)
    {
        var result = await _workflow.RejectAsync(requestId, body.Note, GetActorId(), cancellationToken);
        if (result.Error is not null) return StatusCode(result.StatusCode, result.Error);
        return Ok();
    }

    [HttpGet("analytics/overview")]
    public async Task<ActionResult<PlatformAnalyticsOverviewDto>> AnalyticsOverview(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var from30 = now.AddDays(-30);
        var activeClinics = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().CountAsync(x => x.SubscriptionStatus == TenantSubscriptionState.Active.ToString(), cancellationToken);
        var onlineUsers = await _db.Users.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x => !x.IsDisabled && x.TenantId != Guid.Empty && x.LastSeenAt.HasValue && x.LastSeenAt >= now - OnlineWindow, cancellationToken);
        var mrr = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.SubscriptionStatus == TenantSubscriptionState.Active.ToString())
            .SumAsync(x => x.MonthlyPriceUsd + x.AddonRevenueUsd + x.OverageRevenueUsd, cancellationToken);
        // Cohort-based conversion: requests created in last 30 days vs activated from the same cohort.
        var requested30 = await _db.SubscriptionRequests.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x => x.CreatedAtUtc >= from30, cancellationToken);
        var activated30 = await _db.SubscriptionRequests.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x => x.CreatedAtUtc >= from30 && x.Status == SubscriptionRequestStatus.Activated.ToString(), cancellationToken);
        var cancelled30 = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x => x.SubscriptionStatus == TenantSubscriptionState.Cancelled.ToString() && x.SubscriptionActivatedAtUtc >= from30, cancellationToken);
        var conversionRate = requested30 == 0 ? 0m : Math.Round((activated30 * 100m) / requested30, 2);

        return Ok(new PlatformAnalyticsOverviewDto(activeClinics, onlineUsers, mrr, cancelled30, conversionRate));
    }

    [HttpGet("activity")]
    public async Task<ActionResult<IReadOnlyList<PlatformActivityDto>>> Activity(CancellationToken cancellationToken)
    {
        var logs = await _db.PlatformAuditLogs.IgnoreQueryFilters().AsNoTracking()
            .OrderByDescending(x => x.Timestamp)
            .Take(300)
            .Select(x => new PlatformActivityDto(x.Id, x.Action, x.ActorUserId, x.EntityType, x.EntityId, x.Timestamp))
            .ToArrayAsync(cancellationToken);
        return Ok(logs);
    }

    [HttpGet("health/overview")]
    public async Task<ActionResult<PlatformHealthOverviewDto>> HealthOverview(CancellationToken cancellationToken)
    {
        var probeStarted = DateTime.UtcNow;
        var dbHealthy = true;
        try
        {
            await _db.Tenants.IgnoreQueryFilters().AsNoTracking().AnyAsync(cancellationToken);
        }
        catch
        {
            dbHealthy = false;
        }

        var latencyMs = Math.Max(1, (int)(DateTime.UtcNow - probeStarted).TotalMilliseconds);
        var activeTenants = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x => x.SubscriptionStatus == TenantSubscriptionState.Active.ToString(), cancellationToken);
        var pendingSubscriptions = await _db.SubscriptionRequests.IgnoreQueryFilters().AsNoTracking()
            .CountAsync(x =>
                x.Status == SubscriptionRequestStatus.Requested.ToString()
                || x.Status == SubscriptionRequestStatus.AwaitingPayment.ToString()
                || x.Status == SubscriptionRequestStatus.PaymentConfirmed.ToString(),
                cancellationToken);
        var workerSnapshot = _heartbeats.Snapshot();
        var workers = workerSnapshot.Count == 0
            ? Array.Empty<WorkerHealthItemDto>()
            : workerSnapshot.Select(x => new WorkerHealthItemDto(
                x.Key,
                x.Value,
                x.Value >= DateTime.UtcNow.AddMinutes(-5)))
            .OrderBy(x => x.WorkerName)
            .ToArray();

        return Ok(new PlatformHealthOverviewDto(
            UptimeSeconds: (long)(DateTime.UtcNow - ProcessStartedAtUtc).TotalSeconds,
            ActiveTenants: activeTenants,
            DatabaseHealthy: dbHealthy,
            ApiLatencyMs: latencyMs,
            Workers: workers,
            PendingSubscriptionActions: pendingSubscriptions,
            DeadLetterWebhooks: _deadLetters.Count));
    }

    [HttpGet("metrics")]
    public async Task<ActionResult<PlatformMetricsDto>> Metrics([FromQuery] int days = 7, CancellationToken cancellationToken = default)
    {
        var runtime = _metrics.Snapshot();
        var intelligenceFrom = DateTime.UtcNow.AddDays(-Math.Clamp(days, 1, 30));
        var intelligenceRows = await _db.DecisionTelemetryEvents.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TimestampUtc >= intelligenceFrom)
            .ToArrayAsync(cancellationToken);
        var total = intelligenceRows.Length;
        var succeeded = intelligenceRows.Count(x => x.Outcome == "succeeded" || x.Outcome == "applied");
        var failed = intelligenceRows.Count(x => x.Outcome == "failed");
        var ignored = intelligenceRows.Count(x => x.Outcome == "ignored");
        var predictionAccuracy = succeeded + failed == 0 ? 0 : Math.Round((succeeded * 100m) / (succeeded + failed), 2);
        var actionSuccessRate = total == 0 ? 0 : Math.Round((succeeded * 100m) / total, 2);
        var ignoredRate = total == 0 ? 0 : Math.Round((ignored * 100m) / total, 2);
        return Ok(new PlatformMetricsDto(
            runtime.TotalRequests,
            runtime.ErrorRatePercent,
            runtime.LatencyP95Ms,
            runtime.AuthSuccessRatePercent,
            predictionAccuracy,
            actionSuccessRate,
            ignoredRate));
    }

    [HttpPost("clinics/{tenantId:guid}/doctors")]
    public async Task<ActionResult<CreateDoctorTeamResponse>> CreateDoctorAndReception(Guid tenantId, [FromBody] CreateDoctorTeamRequest request, CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);
        if (tenant is null) return NotFound("Clinic not found.");
        if (string.IsNullOrWhiteSpace(request.DoctorName) || string.IsNullOrWhiteSpace(request.DoctorEmail))
            return BadRequest("Doctor name and email are required.");

        var actor = GetActorId();
        var normalizedDoctorEmail = request.DoctorEmail.Trim().ToLowerInvariant();
        var exists = await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == normalizedDoctorEmail, cancellationToken);
        if (exists) return Conflict("Doctor email already exists.");

        var doctorTempPassword = GenerateTemporaryPassword();
        var receptionistTempPassword = GenerateTemporaryPassword();

        var doctorUser = new User
        {
            Id = Guid.NewGuid(),
            Name = request.DoctorName.Trim(),
            FullName = request.DoctorName.Trim(),
            Email = normalizedDoctorEmail,
            PasswordHash = PasswordHasher.HashPassword(doctorTempPassword),
            Role = UserRole.Doctor,
            TenantId = tenantId,
            CreatedAt = DateTime.UtcNow,
            CreatedByPlatformAdminId = actor
        };

        var doctor = new Doctor
        {
            Id = Guid.NewGuid(),
            Name = request.DoctorName.Trim(),
            Specialty = request.Specialty.Trim(),
            WorkingHours = request.WorkingHours ?? DefaultWorkingHours(),
            LinkedUserId = doctorUser.Id,
            TenantId = tenantId
        };

        var clinicSlug = Slugify(tenant.Name);
        var receptionistEmail = $"reception@{clinicSlug}.local";
        var suffix = 1;
        while (await _db.Users.IgnoreQueryFilters().AnyAsync(x => x.Email == receptionistEmail, cancellationToken))
        {
            receptionistEmail = $"reception{suffix}@{clinicSlug}.local";
            suffix++;
        }

        var receptionistUser = new User
        {
            Id = Guid.NewGuid(),
            Name = "Reception",
            FullName = "Reception",
            Email = receptionistEmail,
            PasswordHash = PasswordHasher.HashPassword(receptionistTempPassword),
            Role = UserRole.Receptionist,
            TenantId = tenantId,
            CreatedAt = DateTime.UtcNow,
            CreatedByPlatformAdminId = actor,
            LinkedToDoctorId = doctor.Id
        };

        _db.Users.Add(doctorUser);
        _db.Users.Add(receptionistUser);
        _db.Doctors.Add(doctor);
        var doctorIdentity = new ApplicationUser
        {
            Id = doctorUser.Id,
            UserName = doctorUser.Email,
            Email = doctorUser.Email,
            FullName = doctorUser.FullName,
            TenantId = tenantId,
            RoleType = RoleType.Doctor,
            IsActive = true
        };
        var doctorCreate = await _identityUsers.CreateAsync(doctorIdentity, doctorTempPassword);
        if (!doctorCreate.Succeeded)
            return BadRequest(string.Join(" | ", doctorCreate.Errors.Select(x => x.Description)));
        await _identityUsers.AddToRoleAsync(doctorIdentity, UserRole.Doctor.ToString());

        var receptionIdentity = new ApplicationUser
        {
            Id = receptionistUser.Id,
            UserName = receptionistUser.Email,
            Email = receptionistUser.Email,
            FullName = receptionistUser.FullName,
            TenantId = tenantId,
            RoleType = RoleType.Reception,
            IsActive = true
        };
        var receptionCreate = await _identityUsers.CreateAsync(receptionIdentity, receptionistTempPassword);
        if (!receptionCreate.Succeeded)
            return BadRequest(string.Join(" | ", receptionCreate.Errors.Select(x => x.Description)));
        await _identityUsers.AddToRoleAsync(receptionIdentity, UserRole.Receptionist.ToString());

        await _db.SaveChangesAsync(cancellationToken);

        await LogAsync("DoctorCreatedWithAutoReception", "Doctor", doctor.Id.ToString(), cancellationToken);

        return Ok(new CreateDoctorTeamResponse(
            tenantId,
            doctor.Id,
            doctorUser.Id,
            receptionistUser.Id,
            new AccountCredentialDto(doctorUser.Email, doctorTempPassword),
            new AccountCredentialDto(receptionistUser.Email, receptionistTempPassword)));
    }

    [HttpPost("clinics/{tenantId:guid}/subscription-request")]
    public async Task<ActionResult<PlatformSubscriptionDto>> CreateSubscriptionRequest(Guid tenantId, [FromBody] CreatePlatformSubscriptionRequest body, CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);
        if (tenant is null) return NotFound("Clinic not found.");

        var tier = PricingCalculator.NormalizeTier(body.PlanTier);
        var channel = PricingCalculator.NormalizeChannel(body.Channel);
        var cycle = body.Cycle?.Equals("Annual", StringComparison.OrdinalIgnoreCase) == true ? "Annual" : "Monthly";
        var monthly = PricingCalculator.ResolveMonthlyPrice(tier, channel);
        var discount = PricingCalculator.NormalizeDiscount(body.AnnualDiscountPercent <= 0 ? 15m : body.AnnualDiscountPercent);
        var finalPrice = cycle == "Annual" ? PricingCalculator.CalculateAnnualPrice(monthly, discount) : monthly;
        var now = DateTime.UtcNow;

        var request = new SubscriptionRequest
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicName = tenant.Name,
            RequestedByDoctorName = body.RequestedByDoctorName?.Trim() ?? "Doctor",
            RequestedByDoctorEmail = body.RequestedByDoctorEmail?.Trim() ?? string.Empty,
            RequestedByPhone = body.RequestedByPhone?.Trim() ?? string.Empty,
            PlanTier = tier,
            Channel = channel,
            Cycle = cycle,
            MonthlyPriceUsd = monthly,
            AnnualDiscountPercent = discount,
            FinalPriceUsd = finalPrice,
            PaymentReference = string.Empty,
            Notes = "[PaymentMethod:Cash] Bootstrapped from onboarding wizard",
            RequestedAddonsJson = "[]",
            Status = SubscriptionRequestStatus.Requested.ToString(),
            CreatedAtUtc = now
        };

        _db.SubscriptionRequests.Add(request);
        _db.SubscriptionRequestStatusHistory.Add(new SubscriptionRequestStatusHistory
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SubscriptionRequestId = request.Id,
            FromStatus = string.Empty,
            ToStatus = SubscriptionRequestStatus.Requested.ToString(),
            Note = "Created from platform onboarding wizard.",
            ChangedByUserId = GetActorId(),
            CreatedAtUtc = now
        });
        await _db.SaveChangesAsync(cancellationToken);
        await LogAsync("SubscriptionRequestedFromOnboarding", "SubscriptionRequest", request.Id.ToString(), cancellationToken);

        var currentPlan = tenant.SubscriptionPlan;
        return Ok(new PlatformSubscriptionDto(
            request.Id,
            request.TenantId,
            request.ClinicName,
            request.RequestedByDoctorName,
            request.RequestedByDoctorEmail,
            request.PlanTier,
            request.Channel,
            request.Cycle,
            request.Status,
            DetectRequestType(currentPlan, request.PlanTier),
            BuildChangeSummary(currentPlan, request.PlanTier, request.Channel, request.Cycle),
            request.FinalPriceUsd,
            request.PaymentReference,
            request.CreatedAtUtc,
            request.ReviewedAtUtc,
            request.DecisionReason));
    }

    private async Task LogAsync(string action, string entityType, string entityId, CancellationToken cancellationToken)
    {
        var actor = GetActorId();
        if (actor == Guid.Empty) return;
        await _audit.LogAsync(action, actor, entityType, entityId, cancellationToken);
    }

    private Guid GetActorId()
    {
        var raw =
            User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(raw, out var userId) ? userId : Guid.Empty;
    }

    private static bool IsOnline(DateTime? lastSeenAt, DateTime nowUtc)
        => lastSeenAt.HasValue && lastSeenAt.Value > nowUtc - OnlineWindow;

    private static string DetectRequestType(string currentPlan, string requestedPlan)
    {
        var current = NormalizeTierRank(currentPlan);
        var requested = NormalizeTierRank(requestedPlan);
        if (current == 0 || requested == 0) return "plan_change";
        if (requested > current) return "upgrade";
        if (requested < current) return "downgrade";
        return "renewal";
    }

    private static int NormalizeTierRank(string tier)
    {
        var value = tier?.Trim().ToLowerInvariant() ?? string.Empty;
        if (value is "starter" or "basic") return 1;
        if (value == "pro") return 2;
        if (value == "growth") return 3;
        return 0;
    }

    private static string BuildChangeSummary(string currentPlan, string requestedPlan, string channel, string cycle)
        => $"Current: {currentPlan} -> Requested: {requestedPlan} ({channel}/{cycle})";

    private static string FullNameOrFallback(string fullName, string email)
        => string.IsNullOrWhiteSpace(fullName) ? email : fullName;

    private static string GenerateTemporaryPassword()
    {
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string digits = "23456789";
        const string special = "!@#$%^&*";
        const string all = lower + upper + digits + special;

        Span<char> chars = stackalloc char[14];
        chars[0] = lower[RandomNumberGenerator.GetInt32(lower.Length)];
        chars[1] = upper[RandomNumberGenerator.GetInt32(upper.Length)];
        chars[2] = digits[RandomNumberGenerator.GetInt32(digits.Length)];
        chars[3] = special[RandomNumberGenerator.GetInt32(special.Length)];
        for (var i = 4; i < chars.Length; i++)
            chars[i] = all[RandomNumberGenerator.GetInt32(all.Length)];

        for (var i = chars.Length - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string(chars);
    }

    private static string Slugify(string input)
    {
        var sb = new StringBuilder(input.Length);
        foreach (var ch in input.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch)) sb.Append(ch);
            else if (sb.Length == 0 || sb[^1] != '-') sb.Append('-');
        }
        return sb.ToString().Trim('-');
    }

    private static WorkingHours DefaultWorkingHours()
    {
        return new WorkingHours
        {
            Days = new List<WorkingHoursDay>
            {
                new() { DayOfWeek = 1, Windows = new List<WorkingHoursWindow> { new() { Start = new TimeOnly(9, 0), End = new TimeOnly(17, 0) } } },
                new() { DayOfWeek = 2, Windows = new List<WorkingHoursWindow> { new() { Start = new TimeOnly(9, 0), End = new TimeOnly(17, 0) } } },
                new() { DayOfWeek = 3, Windows = new List<WorkingHoursWindow> { new() { Start = new TimeOnly(9, 0), End = new TimeOnly(17, 0) } } },
                new() { DayOfWeek = 4, Windows = new List<WorkingHoursWindow> { new() { Start = new TimeOnly(9, 0), End = new TimeOnly(17, 0) } } },
                new() { DayOfWeek = 5, Windows = new List<WorkingHoursWindow> { new() { Start = new TimeOnly(9, 0), End = new TimeOnly(17, 0) } } }
            }
        };
    }

    public sealed record OnlineUserItem(Guid UserId, string FullName, string Email, DateTime? LastSeenAt);
    public sealed record OnlineUsersByClinic(Guid TenantId, string ClinicName, IReadOnlyList<OnlineUserItem> Doctors, IReadOnlyList<OnlineUserItem> Receptionists);
    public sealed record OnlineUsersResponse(IReadOnlyList<OnlineUsersByClinic> Clinics);
    public sealed record PlatformClinicDto(Guid Id, string Name, string Country, string SubscriptionStatus, string SubscriptionPlan, DateTime? ActivatedAt, DateTime? LastActivityAt, bool IsOnline, int DoctorsCount, int ReceptionistsCount, int OnlineUsersCount, DateTime CreatedAt);
    public sealed record ViewWorkspaceResponse(Guid TenantId, string WorkspacePath);
    public sealed record PlatformUserDto(Guid Id, string FullName, string Email, string Role, Guid TenantId, string TenantName, bool IsOnline, DateTime? LastSeenAt, DateTime CreatedAt, bool IsDisabled);
    public sealed record ResetPasswordResponse(Guid UserId, string Email, string TemporaryPassword);
    public sealed record PlatformSubscriptionDto(Guid Id, Guid TenantId, string ClinicName, string RequestedByDoctorName, string RequestedByDoctorEmail, string PlanTier, string Channel, string Cycle, string Status, string RequestType, string ChangeSummary, decimal FinalPriceUsd, string PaymentReference, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc, string? DecisionReason);
    public sealed record PlatformInvoiceDto(Guid Id, Guid TenantId, string TenantName, string InvoiceNumber, string Status, decimal TotalUsd, DateTime IssuedAtUtc, DateTime? PaidAtUtc);
    public sealed record CreateClinicRequest(string Name, string? Country, string? TimeZoneId, string SubscriptionPlan, string Channel, string? Cycle);
    public sealed record DecisionRequest(string? Note);
    public sealed record PaymentConfirmRequest(string PaymentMethod, string? PaymentReference, string? Note);
    public sealed record PlatformAnalyticsOverviewDto(int ActiveClinics, int OnlineUsers, decimal MonthlyRevenueUsd, int ChurnLast30Days, decimal ConversionRatePercent);
    public sealed record PlatformActivityDto(Guid Id, string Action, Guid ActorUserId, string EntityType, string EntityId, DateTime Timestamp);
    public sealed record WorkerHealthItemDto(string WorkerName, DateTime LastSeenAtUtc, bool IsHealthy);
    public sealed record PlatformHealthOverviewDto(long UptimeSeconds, int ActiveTenants, bool DatabaseHealthy, int ApiLatencyMs, IReadOnlyList<WorkerHealthItemDto> Workers, int PendingSubscriptionActions, int DeadLetterWebhooks);
    public sealed record PlatformMetricsDto(long TotalRequests, decimal ErrorRatePercent, int ApiLatencyP95Ms, decimal AuthSuccessRatePercent, decimal PredictionAccuracyPercent, decimal ActionSuccessRatePercent, decimal IgnoredDecisionsPercent);
    public sealed record CreateDoctorTeamRequest(string DoctorName, string DoctorEmail, string Specialty, WorkingHours? WorkingHours);
    public sealed record CreatePlatformSubscriptionRequest(string PlanTier, string Channel, string? Cycle, decimal AnnualDiscountPercent, string? RequestedByDoctorName, string? RequestedByDoctorEmail, string? RequestedByPhone);
    public sealed record AccountCredentialDto(string Email, string TemporaryPassword);
    public sealed record CreateDoctorTeamResponse(Guid TenantId, Guid DoctorId, Guid DoctorUserId, Guid ReceptionistUserId, AccountCredentialDto DoctorCredentials, AccountCredentialDto ReceptionistCredentials);
}
