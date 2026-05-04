using ClinicSaaS.Api.Webhooks;
using ClinicSaaS.Application.Tenancy;
using ClinicSaaS.Application.WhatsApp;
using ClinicSaaS.Infrastructure.Persistence;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/whatsapp")]
[AllowAnonymous]
public sealed class WhatsAppController : ControllerBase
{
    private const string WebhookSecretHeaderName = "X-Webhook-Secret";
    private readonly WhatsAppConversationService _whatsapp;
    private readonly AppointmentWebhookEnqueuer _webhooks;
    private readonly ClinicDbContext _db;
    private readonly TenantContext _tenant;

    public WhatsAppController(
        WhatsAppConversationService whatsapp,
        AppointmentWebhookEnqueuer webhooks,
        ClinicDbContext db,
        TenantContext tenant)
    {
        _whatsapp = whatsapp;
        _webhooks = webhooks;
        _db = db;
        _tenant = tenant;
    }

    [HttpPost("incoming")]
    [EnableRateLimiting("whatsapp-webhook")]
    public async Task<ActionResult<WhatsAppIncomingResponse>> Incoming(
        [FromBody] WhatsAppIncomingRequest request,
        CancellationToken cancellationToken)
    {
        var primary = Environment.GetEnvironmentVariable("OPS_WHATSAPP_PRIMARY_HANDLER");
        if (string.Equals(primary, "ops", StringComparison.OrdinalIgnoreCase))
            return StatusCode(StatusCodes.Status409Conflict, "WhatsApp inbound is owned by ops-dashboard for this environment.");

        if (_tenant.TenantId == Guid.Empty)
            return BadRequest("Tenant could not be resolved for this request.");

        var providedSecret = Request.Headers[WebhookSecretHeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(providedSecret))
            return Unauthorized("Missing webhook secret.");

        var tenantSecret = await _db.Tenants.AsNoTracking()
            .Where(t => t.Id == _tenant.TenantId)
            .Select(t => t.WhatsAppWebhookSecret)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(tenantSecret))
            return Unauthorized("Webhook secret is not configured for this tenant.");

        if (!AreSecretsEqual(tenantSecret, providedSecret))
            return Unauthorized("Invalid webhook secret.");

        var result = await _whatsapp.HandleIncomingAsync(request, cancellationToken);

        if (result.AppointmentId is Guid id)
        {
            var appt = await _db.Appointments.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
            if (appt is not null)
                await _webhooks.EnqueueAppointmentCreatedAsync(appt, cancellationToken);
        }

        return Ok(result);
    }

    private static bool AreSecretsEqual(string expected, string provided)
    {
        var left = Encoding.UTF8.GetBytes(expected);
        var right = Encoding.UTF8.GetBytes(provided);
        return CryptographicOperations.FixedTimeEquals(left, right);
    }
}
