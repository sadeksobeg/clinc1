using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using ClinicSaaS.Api.Auth;
using ClinicSaaS.Api.Middleware;
using ClinicSaaS.Api.Reliability;
using ClinicSaaS.Api.Product;
using ClinicSaaS.Api.Services;
using ClinicSaaS.Api.Webhooks;
using ClinicSaaS.Application.Tenancy;
using ClinicSaaS.Application.Appointments;
using ClinicSaaS.Application.Patients;
using ClinicSaaS.Application.Scheduling;
using ClinicSaaS.Application.WhatsApp;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Infrastructure.Persistence;
using ClinicSaaS.Infrastructure.Persistence.Repositories;
using ClinicSaaS.Infrastructure.Scheduling;
using ClinicSaaS.Infrastructure.Webhooks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Globalization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.CustomSchemaIds(type => (type.FullName ?? type.Name).Replace("+", "."));
});
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<RequestIdempotencyStore>();

// Tenant context must be resolvable both as concrete TenantContext (middleware)
// and as ICurrentTenant (EF + other services).
builder.Services.AddScoped<TenantContext>();
builder.Services.AddScoped<ICurrentTenant>(sp => sp.GetRequiredService<TenantContext>());

var connectionString = builder.Configuration["Postgres:ConnectionString"];
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Missing configuration: Postgres:ConnectionString");

builder.Services.AddDbContext<ClinicDbContext>(options => options.UseNpgsql(connectionString));
builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireUppercase = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireDigit = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
        options.Lockout.AllowedForNewUsers = true;
    })
    .AddRoles<IdentityRole<Guid>>()
    .AddSignInManager()
    .AddEntityFrameworkStores<ClinicDbContext>()
    .AddDefaultTokenProviders();
builder.Services.AddScoped<IPasswordHasher<ApplicationUser>, HybridIdentityPasswordHasher>();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.AddSingleton<JwtTokenService>();

// Scheduling + booking services (tenant-aware via EF global query filters).
builder.Services.AddScoped<IAppointmentSchedulerData, AppointmentSchedulerData>();
builder.Services.AddScoped<AppointmentScheduler>();
builder.Services.AddScoped<IAppointmentRepository, AppointmentRepository>();
builder.Services.AddScoped<IPatientRepository, PatientRepository>();
builder.Services.AddScoped<IConversationStateRepository, ConversationStateRepository>();
builder.Services.AddScoped<AppointmentBookingService>();
builder.Services.AddScoped<WhatsAppConversationService>();
builder.Services.AddScoped<AppointmentWebhookEnqueuer>();
builder.Services.AddScoped<EntitlementService>();
builder.Services.AddScoped<PlatformAuditService>();
builder.Services.AddScoped<SubscriptionWorkflowService>();
builder.Services.AddScoped<UsageService>();
builder.Services.AddScoped<BillingService>();
builder.Services.AddScoped<SubscriptionService>();
builder.Services.AddScoped<InvoiceNumberGenerator>();
builder.Services.AddScoped<LedgerService>();
builder.Services.AddScoped<ReconciliationService>();
builder.Services.AddScoped<DunningService>();
builder.Services.AddScoped<RevenueAnalyticsService>();
builder.Services.AddScoped<InvoicePdfService>();
builder.Services.AddSingleton<PresenceService>();
builder.Services.AddSingleton<OperationalMetricsService>();
builder.Services.AddSingleton<WorkerHeartbeatService>();
builder.Services.AddHostedService<PresenceSyncBackgroundService>();
builder.Services.AddHostedService<DunningBackgroundService>();

// n8n webhook automation (queued + background delivery).
builder.Services.Configure<N8nOptions>(builder.Configuration.GetSection("N8n"));
builder.Services.AddSingleton<WebhookQueue>();
builder.Services.AddSingleton<IWebhookQueue>(sp => sp.GetRequiredService<WebhookQueue>());
builder.Services.AddSingleton<WebhookDeadLetterStore>();
builder.Services.AddHttpClient<N8nWebhookClient>();
builder.Services.AddHostedService<WebhookBackgroundWorker>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown-ip";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"auth:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 12,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            });
    });
    options.AddPolicy("platform", context =>
    {
        var user = context.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value ?? "anonymous";
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown-ip";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"platform:{user}:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            });
    });
    options.AddPolicy("whatsapp-webhook", context =>
    {
        var tenant = context.Request.Headers["X-Tenant-Id"].FirstOrDefault() ?? "unknown-tenant";
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown-ip";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"{tenant}:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 40,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            });
    });
});

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromSeconds(10),
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:SigningKey"] ?? string.Empty)),
            RoleClaimType = ClaimTypes.Role,
            NameClaimType = JwtRegisteredClaimNames.Sub
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("PlatformOnly", p => p.RequireRole(UserRole.PlatformAdmin.ToString()));
    options.AddPolicy("TenantUser", p => p.RequireRole(UserRole.PlatformAdmin.ToString(), UserRole.Doctor.ToString(), UserRole.Receptionist.ToString(), UserRole.Support.ToString()));
    options.AddPolicy("DoctorOnly", p => p.RequireRole(UserRole.Doctor.ToString()));
    options.AddPolicy("ReceptionOnly", p => p.RequireRole(UserRole.Receptionist.ToString()));
    options.AddPolicy("SupportOnly", p => p.RequireRole(UserRole.Support.ToString()));
    options.AddPolicy("DoctorOrPlatform", p => p.RequireRole(UserRole.Doctor.ToString(), UserRole.PlatformAdmin.ToString()));
    options.AddPolicy("ReceptionOrPlatform", p => p.RequireRole(UserRole.Receptionist.ToString(), UserRole.PlatformAdmin.ToString()));
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<TraceContextMiddleware>();
if (!app.Environment.IsDevelopment())
    app.UseHttpsRedirection();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'; object-src 'none'";
    await next();
});

app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<TenantResolutionMiddleware>();
app.UseAuthentication();
app.UseMiddleware<UserPresenceMiddleware>();
app.UseMiddleware<UsageGuardMiddleware>();
app.Use(async (context, next) =>
{
    var started = DateTime.UtcNow;
    var metrics = context.RequestServices.GetRequiredService<OperationalMetricsService>();
    var correlationId = context.TraceIdentifier;
    context.Response.Headers["X-Correlation-Id"] = correlationId;
    var tenantContext = context.RequestServices.GetService<ICurrentTenant>() as TenantContext;
    var userId = context.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
    using var scope = app.Logger.BeginScope(new Dictionary<string, object?>
    {
        ["TenantId"] = tenantContext?.TenantId,
        ["UserId"] = userId,
        ["Path"] = context.Request.Path.Value,
        ["CorrelationId"] = correlationId
    });
    await next();
    var latencyMs = Math.Max(1, (int)(DateTime.UtcNow - started).TotalMilliseconds);
    metrics.RecordRequest(context.Response.StatusCode, latencyMs);
});
app.UseRateLimiter();

// Enforce tenant isolation at the API boundary (token tenant must match resolved tenant).
// Until TenantResolutionMiddleware is implemented, we skip this check when TenantId is Guid.Empty.
app.Use(async (context, next) =>
{
    if (context.User?.Identity?.IsAuthenticated != true)
    {
        await next();
        return;
    }

    var tenantContext = context.RequestServices.GetService<ICurrentTenant>() as TenantContext;
    if (tenantContext is null || tenantContext.TenantId == Guid.Empty)
    {
        await next();
        return;
    }

    if (!context.User.IsInRole(UserRole.PlatformAdmin.ToString()))
    {
        var tokenTenantIdRaw = context.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(tokenTenantIdRaw, out var tokenTenantId) || tokenTenantId != tenantContext.TenantId)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsync("Cross-tenant access is not allowed.");
            return;
        }

        var db = context.RequestServices.GetRequiredService<ClinicDbContext>();
        var tenant = await db.Tenants.IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tenantContext.TenantId);
        if (tenant is not null)
        {
            var nowUtc = DateTime.UtcNow;

            // Backfill legacy tenants to 3-day trial on first authenticated usage.
            if (string.IsNullOrWhiteSpace(tenant.SubscriptionStatus))
            {
                var mutableTenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantContext.TenantId);
                if (mutableTenant is not null)
                {
                    mutableTenant.SubscriptionStatus = "TrialActive";
                    mutableTenant.SubscriptionActivatedAtUtc = nowUtc;
                    mutableTenant.SubscriptionExpiresAtUtc = nowUtc.AddDays(3);
                    await db.SaveChangesAsync();
                    tenant = mutableTenant;
                }
            }

            var expiry = tenant.SubscriptionExpiresAtUtc;
            var isExpired = expiry.HasValue && nowUtc > expiry.Value;
            var trialExpired = tenant.SubscriptionStatus == "TrialActive" && isExpired;
            var blockedStatus = tenant.SubscriptionStatus is "Expired" or "Suspended" or "Rejected";

            if (trialExpired || blockedStatus)
            {
                context.Response.StatusCode = StatusCodes.Status402PaymentRequired;
                var until = expiry?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "N/A";
                await context.Response.WriteAsJsonAsync(new
                {
                    code = "subscription_required",
                    message = $"Your 3-day trial has ended. Please request activation from PlatformAdmin. ExpiredAtUtc={until}"
                });
                return;
            }
        }
    }

    await next();
});

app.UseAuthorization();

app.MapControllers();
app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ClinicDbContext>();
    db.Database.Migrate();
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
    foreach (var role in new[] { UserRole.PlatformAdmin.ToString(), UserRole.Doctor.ToString(), UserRole.Receptionist.ToString(), UserRole.Support.ToString() })
    {
        if (!roleManager.Roles.Any(x => x.Name == role))
            roleManager.CreateAsync(new IdentityRole<Guid>(role)).GetAwaiter().GetResult();
    }

    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
    var legacyUsers = db.Users.IgnoreQueryFilters().AsNoTracking().ToArray();
    foreach (var legacy in legacyUsers)
    {
        if (userManager.Users.Any(x => x.Id == legacy.Id)) continue;
        var legacyRole = Enum.IsDefined(typeof(UserRole), legacy.Role)
            ? legacy.Role
            : UserRole.PlatformAdmin;
        var identityRoleName = legacyRole.ToString();
        var roleType = legacy.Role switch
        {
            UserRole.PlatformAdmin => RoleType.PlatformAdmin,
            UserRole.Receptionist => RoleType.Reception,
            UserRole.Support => RoleType.Support,
            _ => RoleType.Doctor
        };
        var appUser = new ApplicationUser
        {
            Id = legacy.Id,
            UserName = legacy.Email,
            Email = legacy.Email,
            FullName = string.IsNullOrWhiteSpace(legacy.FullName) ? legacy.Name : legacy.FullName,
            TenantId = legacy.TenantId == Guid.Empty ? null : legacy.TenantId,
            RoleType = roleType,
            IsActive = !legacy.IsDisabled,
            CreatedAt = legacy.CreatedAt
        };
        userManager.CreateAsync(appUser).GetAwaiter().GetResult();
        appUser.PasswordHash = legacy.PasswordHash;
        userManager.UpdateAsync(appUser).GetAwaiter().GetResult();
        userManager.AddToRoleAsync(appUser, identityRoleName).GetAwaiter().GetResult();
    }

    if (!db.AddonCatalogItems.Any())
    {
        db.AddonCatalogItems.AddRange(
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "extra_seat", Name = "Extra Doctor Seat", UnitType = "seat", UnitPriceUsd = 15m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "extra_messages", Name = "Extra Messages Pack", UnitType = "messages", UnitPriceUsd = 25m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "reports_plus", Name = "Reports Plus", UnitType = "feature", UnitPriceUsd = 39m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "ai_assistant", Name = "AI Assistant", UnitType = "feature", UnitPriceUsd = 59m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "extra_whatsapp_pack", Name = "Extra WhatsApp conversations pack", UnitType = "pack", UnitPriceUsd = 10m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "whatsapp_campaigns", Name = "WhatsApp Campaigns", UnitType = "feature", UnitPriceUsd = 15m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "advanced_analytics", Name = "Advanced analytics", UnitType = "feature", UnitPriceUsd = 12m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "multi_branch", Name = "Multi-branch", UnitType = "feature", UnitPriceUsd = 20m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "api_access", Name = "API access", UnitType = "feature", UnitPriceUsd = 25m, IsActive = true },
            new ClinicSaaS.Domain.Entities.AddonCatalogItem { Id = Guid.NewGuid(), Code = "white_label_branding", Name = "White-label branding", UnitType = "feature", UnitPriceUsd = 30m, IsActive = true });
        db.SaveChanges();
    }
}

app.Run();
