using ClinicSaaS.Application.Tenancy;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Middleware;

public sealed class TenantResolutionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IConfiguration _configuration;

    public TenantResolutionMiddleware(RequestDelegate next, IConfiguration configuration)
    {
        _next = next;
        _configuration = configuration;
    }

    public async Task InvokeAsync(HttpContext context, TenantContext tenantContext, ClinicDbContext db)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        var isPlatformScope =
            path.StartsWith("/api/platform/", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/admin/tenants", StringComparison.OrdinalIgnoreCase);

        // Platform/admin endpoints must stay outside tenant-bound EF writes.
        if (isPlatformScope)
        {
            tenantContext.TenantId = Guid.Empty;
            await _next(context);
            return;
        }

        var tenantRequired = !path.Equals("/healthz", StringComparison.OrdinalIgnoreCase)
                             && !path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase)
                             && !isPlatformScope;

        var tenantHeaderName = _configuration["Tenancy:TenantHeader"] ?? "X-Tenant-Id";
        var subdomainSeparator = _configuration["Tenancy:SubdomainSeparator"] ?? ".";

        // 1) Primary: header-based resolution (UUID).
        var tenantHeaderValue = context.Request.Headers[tenantHeaderName].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(tenantHeaderValue) && Guid.TryParse(tenantHeaderValue, out var tenantIdFromHeader))
        {
            if (tenantIdFromHeader == Guid.Empty)
            {
                if (tenantRequired)
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await context.Response.WriteAsync("TenantId cannot be empty.");
                    return;
                }

                await _next(context);
                return;
            }

            tenantContext.TenantId = tenantIdFromHeader;
            await _next(context);
            return;
        }

        // 2) Fallback: resolve from subdomain (e.g., {tenant}.{domain}).
        var host = context.Request.Host.Host;
        if (!string.IsNullOrWhiteSpace(host))
        {
            var parts = host.Split(new[] { subdomainSeparator }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                var subdomain = parts[0].Trim().ToLowerInvariant();

                var tenant = await db.Tenants
                    .Where(t => t.Name.ToLower() == subdomain)
                    .Select(t => new { t.Id })
                    .FirstOrDefaultAsync(context.RequestAborted);

                if (tenant is not null)
                    tenantContext.TenantId = tenant.Id;
            }
        }

        if (tenantContext.TenantId == Guid.Empty && tenantRequired)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("Tenant could not be resolved for this request.");
            return;
        }

        await _next(context);
    }
}

