using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/tenant")]
[Authorize]
public sealed class TenantCurrentController : ControllerBase
{
    private readonly ClinicDbContext _db;

    public TenantCurrentController(ClinicDbContext db)
    {
        _db = db;
    }

    [HttpGet("current")]
    public async Task<ActionResult<TenantCurrentDto>> Current(CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (tenant is null)
            return NotFound("Tenant not found.");

        return Ok(new TenantCurrentDto(
            tenant.Id,
            tenant.Name,
            tenant.TimeZoneId,
            tenant.SubscriptionStatus,
            tenant.SubscriptionActivatedAtUtc,
            tenant.SubscriptionExpiresAtUtc));
    }

    public sealed record TenantCurrentDto(
        Guid Id,
        string Name,
        string TimeZoneId,
        string SubscriptionStatus,
        DateTime? SubscriptionActivatedAtUtc,
        DateTime? SubscriptionExpiresAtUtc);
}
