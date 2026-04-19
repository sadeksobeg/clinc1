using ClinicSaaS.Api.Auth;
using ClinicSaaS.Api.Services;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Domain.WorkingHours;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("auth")]
public sealed class IdentityAuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly ClinicDbContext _db;
    private readonly JwtTokenService _tokens;
    private readonly JwtOptions _jwtOptions;
    private readonly PlatformAuditService _audit;
    private readonly OperationalMetricsService _metrics;

    public IdentityAuthController(
        UserManager<ApplicationUser> users,
        SignInManager<ApplicationUser> signInManager,
        ClinicDbContext db,
        JwtTokenService tokens,
        IOptions<JwtOptions> jwtOptions,
        PlatformAuditService audit,
        OperationalMetricsService metrics)
    {
        _users = users;
        _signInManager = signInManager;
        _db = db;
        _tokens = tokens;
        _jwtOptions = jwtOptions.Value;
        _audit = audit;
        _metrics = metrics;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest body, CancellationToken cancellationToken)
    {
        var email = body.Email.Trim().ToLowerInvariant();
        var user = await _users.Users.FirstOrDefaultAsync(x => x.Email == email, cancellationToken);
        if (user is null || !user.IsActive)
        {
            _metrics.RecordAuth(false);
            await AuditLoginAsync(null, false, cancellationToken);
            return Unauthorized("Invalid email or password.");
        }

        var check = await _signInManager.CheckPasswordSignInAsync(user, body.Password, lockoutOnFailure: true);
        if (!check.Succeeded)
        {
            _metrics.RecordAuth(false);
            await AuditLoginAsync(user.Id, false, cancellationToken);
            return Unauthorized("Invalid email or password.");
        }

        user.LastLoginAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);
        var role = await ResolvePrimaryRoleAsync(user);
        user.RoleType = role;
        var accessToken = _tokens.CreateToken(user);
        var refreshTokenRaw = JwtTokenService.CreateRefreshToken();
        _db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = JwtTokenService.HashRefreshToken(refreshTokenRaw),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            CreatedByIp = HttpContext.Connection.RemoteIpAddress?.ToString()
        });
        await _db.SaveChangesAsync(cancellationToken);
        _metrics.RecordAuth(true);
        await AuditLoginAsync(user.Id, true, cancellationToken);

        return Ok(new AuthResponse(
            AccessToken: accessToken,
            RefreshToken: refreshTokenRaw,
            ExpiresAt: DateTimeOffset.UtcNow.AddMinutes(_jwtOptions.AccessTokenMinutes)));
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Refresh([FromBody] RefreshRequest body, CancellationToken cancellationToken)
    {
        var hash = JwtTokenService.HashRefreshToken(body.RefreshToken);
        var row = await _db.RefreshTokens.FirstOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
        if (row is null || !row.IsActive) return Unauthorized("Invalid refresh token.");

        var user = await _users.Users.FirstOrDefaultAsync(x => x.Id == row.UserId, cancellationToken);
        if (user is null || !user.IsActive) return Unauthorized("User not found.");

        row.RevokedAtUtc = DateTime.UtcNow;
        var next = JwtTokenService.CreateRefreshToken();
        row.ReplacedByTokenHash = JwtTokenService.HashRefreshToken(next);
        _db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = row.UserId,
            TokenHash = row.ReplacedByTokenHash,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            CreatedByIp = HttpContext.Connection.RemoteIpAddress?.ToString()
        });

        user.RoleType = await ResolvePrimaryRoleAsync(user);
        var accessToken = _tokens.CreateToken(user);
        await _db.SaveChangesAsync(cancellationToken);
        await AuditActionAsync("token_refreshed", user.Id, "ApplicationUser", user.Id.ToString(), cancellationToken);
        return Ok(new AuthResponse(accessToken, next, DateTimeOffset.UtcNow.AddMinutes(_jwtOptions.AccessTokenMinutes)));
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<ActionResult> Logout([FromBody] RefreshRequest body, CancellationToken cancellationToken)
    {
        var hash = JwtTokenService.HashRefreshToken(body.RefreshToken);
        var row = await _db.RefreshTokens.FirstOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
        if (row is not null && row.RevokedAtUtc is null)
        {
            row.RevokedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

        var actor = ResolveActorId();
        if (actor.HasValue)
            await AuditActionAsync("logout", actor.Value, "ApplicationUser", actor.Value.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("register-doctor")]
    [AllowAnonymous]
    public async Task<ActionResult<RegisterDoctorResponse>> RegisterDoctor([FromBody] RegisterDoctorRequest body, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(body.ClinicName) || string.IsNullOrWhiteSpace(body.Email))
            return BadRequest("ClinicName and Email are required.");

        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = body.ClinicName.Trim(),
            Country = body.Country?.Trim() ?? string.Empty,
            TimeZoneId = "Asia/Baghdad",
            SubscriptionStatus = "Pending",
            SubscriptionPlan = "Growth",
            SubscriptionChannel = "WhatsApp",
            SubscriptionCycle = "Monthly",
            MonthlyPriceUsd = 0,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tenants.Add(tenant);

        var doctorUser = await CreateIdentityAndLegacyUserAsync(
            id: Guid.NewGuid(),
            fullName: body.FullName,
            email: body.Email,
            password: body.Password,
            roleType: RoleType.Doctor,
            tenantId: tenant.Id,
            legacyRole: UserRole.Doctor,
            cancellationToken);

        var doctor = new Doctor
        {
            Id = Guid.NewGuid(),
            Name = body.FullName.Trim(),
            Specialty = string.IsNullOrWhiteSpace(body.Specialty) ? "General" : body.Specialty.Trim(),
            TenantId = tenant.Id,
            LinkedUserId = doctorUser.Id,
            WorkingHours = DefaultWorkingHours()
        };
        _db.Doctors.Add(doctor);

        var receptionistTempPassword = GenerateTemporaryPassword();
        var receptionEmail = $"reception@{Slugify(tenant.Name)}.local";
        var receptionUser = await CreateIdentityAndLegacyUserAsync(
            id: Guid.NewGuid(),
            fullName: "Reception",
            email: receptionEmail,
            password: receptionistTempPassword,
            roleType: RoleType.Reception,
            tenantId: tenant.Id,
            legacyRole: UserRole.Receptionist,
            cancellationToken,
            linkedDoctorId: doctor.Id);

        await _db.SaveChangesAsync(cancellationToken);
        await AuditActionAsync("doctor_registered", doctorUser.Id, "Tenant", tenant.Id.ToString(), cancellationToken);

        return Ok(new RegisterDoctorResponse(
            tenant.Id,
            doctorUser.Email!,
            receptionUser.Email!,
            receptionistTempPassword));
    }

    [HttpPost("register-reception")]
    [Authorize(Policy = "DoctorOnly")]
    public async Task<ActionResult<RegisterReceptionResponse>> RegisterReception([FromBody] RegisterReceptionRequest body, CancellationToken cancellationToken)
    {
        var actor = ResolveActorId();
        if (!actor.HasValue) return Unauthorized();

        var doctorLegacy = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.Id == actor.Value && x.Role == UserRole.Doctor, cancellationToken);
        if (doctorLegacy is null) return Forbid();

        var reception = await CreateIdentityAndLegacyUserAsync(
            id: Guid.NewGuid(),
            fullName: body.FullName,
            email: body.Email,
            password: body.Password,
            roleType: RoleType.Reception,
            tenantId: doctorLegacy.TenantId,
            legacyRole: UserRole.Receptionist,
            cancellationToken,
            linkedDoctorId: doctorLegacy.LinkedToDoctorId);
        await _db.SaveChangesAsync(cancellationToken);
        await AuditActionAsync("reception_registered", actor.Value, "ApplicationUser", reception.Id.ToString(), cancellationToken);
        return Ok(new RegisterReceptionResponse(reception.Id, reception.Email!));
    }

    private async Task<ApplicationUser> CreateIdentityAndLegacyUserAsync(
        Guid id,
        string fullName,
        string email,
        string password,
        RoleType roleType,
        Guid tenantId,
        UserRole legacyRole,
        CancellationToken cancellationToken,
        Guid? linkedDoctorId = null)
    {
        var normalized = email.Trim().ToLowerInvariant();
        if (await _users.Users.AnyAsync(x => x.Email == normalized, cancellationToken))
            throw new InvalidOperationException("Email already exists.");

        var appUser = new ApplicationUser
        {
            Id = id,
            UserName = normalized,
            Email = normalized,
            FullName = fullName.Trim(),
            TenantId = tenantId,
            RoleType = roleType,
            IsActive = true
        };
        var create = await _users.CreateAsync(appUser, password);
        if (!create.Succeeded)
            throw new InvalidOperationException(string.Join(" | ", create.Errors.Select(e => e.Description)));

        await _users.AddToRoleAsync(appUser, legacyRole.ToString());
        _db.Users.Add(new User
        {
            Id = id,
            Name = fullName.Trim(),
            FullName = fullName.Trim(),
            Email = normalized,
            PasswordHash = PasswordHasher.HashPassword(password),
            Role = legacyRole,
            TenantId = tenantId,
            IsDisabled = false,
            CreatedAt = DateTime.UtcNow,
            LinkedToDoctorId = linkedDoctorId
        });
        return appUser;
    }

    private async Task<RoleType> ResolvePrimaryRoleAsync(ApplicationUser user)
    {
        var roles = await _users.GetRolesAsync(user);
        if (roles.Contains(UserRole.PlatformAdmin.ToString(), StringComparer.OrdinalIgnoreCase)) return RoleType.PlatformAdmin;
        if (roles.Contains(UserRole.Doctor.ToString(), StringComparer.OrdinalIgnoreCase)) return RoleType.Doctor;
        if (roles.Contains(UserRole.Receptionist.ToString(), StringComparer.OrdinalIgnoreCase)) return RoleType.Reception;
        if (roles.Contains(UserRole.Support.ToString(), StringComparer.OrdinalIgnoreCase)) return RoleType.Support;
        return user.RoleType;
    }

    private Guid? ResolveActorId()
    {
        var raw = User.FindFirst("sub")?.Value
                  ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    private async Task AuditLoginAsync(Guid? userId, bool success, CancellationToken cancellationToken)
    {
        if (!userId.HasValue || userId == Guid.Empty) return;
        await AuditActionAsync(success ? "login_success" : "login_failed", userId.Value, "ApplicationUser", userId.Value.ToString(), cancellationToken);
    }

    private async Task AuditActionAsync(string action, Guid actor, string entityType, string entityId, CancellationToken cancellationToken)
    {
        await _audit.LogAsync(action, actor, entityType, entityId, cancellationToken);
    }

    private static string GenerateTemporaryPassword()
    {
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string digits = "23456789";
        const string special = "!@#$%^&*";
        const string all = lower + upper + digits + special;

        Span<char> chars = stackalloc char[14];
        chars[0] = lower[System.Security.Cryptography.RandomNumberGenerator.GetInt32(lower.Length)];
        chars[1] = upper[System.Security.Cryptography.RandomNumberGenerator.GetInt32(upper.Length)];
        chars[2] = digits[System.Security.Cryptography.RandomNumberGenerator.GetInt32(digits.Length)];
        chars[3] = special[System.Security.Cryptography.RandomNumberGenerator.GetInt32(special.Length)];
        for (var i = 4; i < chars.Length; i++)
            chars[i] = all[System.Security.Cryptography.RandomNumberGenerator.GetInt32(all.Length)];

        for (var i = chars.Length - 1; i > 0; i--)
        {
            var j = System.Security.Cryptography.RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string(chars);
    }

    private static string Slugify(string input)
    {
        var chars = input.Trim().ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray();
        return new string(chars).Trim('-');
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

    public sealed record LoginRequest(string Email, string Password);
    public sealed record RefreshRequest(string RefreshToken);
    public sealed record AuthResponse(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt);
    public sealed record RegisterDoctorRequest(string ClinicName, string FullName, string Email, string Password, string? Specialty, string? Country);
    public sealed record RegisterDoctorResponse(Guid TenantId, string DoctorEmail, string ReceptionEmail, string ReceptionTemporaryPassword);
    public sealed record RegisterReceptionRequest(string FullName, string Email, string Password);
    public sealed record RegisterReceptionResponse(Guid UserId, string Email);
}
