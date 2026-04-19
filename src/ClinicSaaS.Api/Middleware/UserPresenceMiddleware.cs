using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ClinicSaaS.Api.Services;

namespace ClinicSaaS.Api.Middleware;

public sealed class UserPresenceMiddleware
{
    private readonly RequestDelegate _next;

    public UserPresenceMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, PresenceService presence)
    {
        if (context.User?.Identity?.IsAuthenticated == true)
        {
            var raw =
                context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                ?? context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? context.User.FindFirst("sub")?.Value;
            if (Guid.TryParse(raw, out var userId))
            {
                var tenantRaw = context.User.FindFirst("tenant_id")?.Value;
                var tenantId = Guid.TryParse(tenantRaw, out var parsedTenantId) ? parsedTenantId : Guid.Empty;
                if (tenantId != Guid.Empty)
                {
                    presence.Touch(userId, tenantId, DateTime.UtcNow);
                }
            }
        }

        await _next(context);
    }
}
