using ClinicSaaS.Api.Services;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Middleware;

public sealed class UsageGuardMiddleware
{
    private readonly RequestDelegate _next;

    public UsageGuardMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task Invoke(HttpContext context, ClinicDbContext db, UsageService usageService)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        var guarded = path.Contains("/api/appointments", StringComparison.OrdinalIgnoreCase)
            || path.Contains("/api/communications", StringComparison.OrdinalIgnoreCase)
            || path.Contains("/api/users", StringComparison.OrdinalIgnoreCase);
        if (!guarded || context.User?.Identity?.IsAuthenticated != true)
        {
            await _next(context);
            return;
        }

        var tenantRaw = context.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(tenantRaw, out var tenantId))
        {
            await _next(context);
            return;
        }

        var sub = await db.Subscriptions.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.TenantId == tenantId, context.RequestAborted);
        if (sub is null)
        {
            await _next(context);
            return;
        }
        var plan = await db.Plans.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == sub.PlanId, context.RequestAborted);
        if (plan is null)
        {
            await _next(context);
            return;
        }

        var snapshot = await usageService.GetUsageAsync(tenantId, context.RequestAborted);
        var comparison = usageService.CompareAgainstPlan(snapshot, plan);
        var doctors = usageService.EvaluateEnforcement(comparison.Doctors, 2);
        if (doctors.Blocked)
        {
            context.Response.StatusCode = StatusCodes.Status402PaymentRequired;
            await context.Response.WriteAsJsonAsync(new { code = "usage_hard_limit", message = "Usage limit reached. Upgrade your plan." });
            return;
        }
        await _next(context);
    }
}

