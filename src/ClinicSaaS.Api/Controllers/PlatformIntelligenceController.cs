using System.IdentityModel.Tokens.Jwt;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/platform/intelligence")]
[Authorize(Policy = "PlatformOnly")]
public sealed class PlatformIntelligenceController : ControllerBase
{
    private readonly ClinicDbContext _db;

    public PlatformIntelligenceController(ClinicDbContext db)
    {
        _db = db;
    }

    [HttpPost("events")]
    public async Task<ActionResult> IngestEvents([FromBody] IReadOnlyList<IntelligenceEventRequest> events, CancellationToken cancellationToken)
    {
        if (events.Count == 0) return Ok();

        var actor = ResolveActorId();
        var tenantId = ResolveTenantId();
        var now = DateTime.UtcNow;
        foreach (var item in events)
        {
            _db.DecisionTelemetryEvents.Add(new DecisionTelemetryEvent
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId == Guid.Empty ? Guid.Empty : tenantId,
                UserId = actor == Guid.Empty ? null : actor,
                PredictionId = item.PredictionId?.Trim() ?? string.Empty,
                DecisionId = item.DecisionId?.Trim() ?? string.Empty,
                ActionId = item.ActionId?.Trim() ?? string.Empty,
                Outcome = item.Outcome?.Trim().ToLowerInvariant() ?? "unknown",
                TimestampUtc = item.TimestampUtc ?? now,
                CorrelationId = item.CorrelationId,
                MetadataJson = item.MetadataJson
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpGet("metrics")]
    public async Task<ActionResult<IntelligenceMetricsDto>> Metrics([FromQuery] int days = 7, CancellationToken cancellationToken = default)
    {
        days = Math.Clamp(days, 1, 30);
        var from = DateTime.UtcNow.AddDays(-days);
        var rows = await _db.DecisionTelemetryEvents.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TimestampUtc >= from)
            .ToArrayAsync(cancellationToken);

        var total = rows.Length;
        if (total == 0) return Ok(new IntelligenceMetricsDto(0, 0, 0, 0));
        var succeeded = rows.Count(x => x.Outcome == "succeeded");
        var failed = rows.Count(x => x.Outcome == "failed");
        var ignored = rows.Count(x => x.Outcome == "ignored");
        var accuracy = Math.Round((succeeded * 100m) / Math.Max(1, succeeded + failed), 2);
        var successRate = Math.Round((succeeded * 100m) / total, 2);
        var ignoredRate = Math.Round((ignored * 100m) / total, 2);
        return Ok(new IntelligenceMetricsDto(total, accuracy, successRate, ignoredRate));
    }

    private Guid ResolveActorId()
    {
        var raw = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(raw, out var value) ? value : Guid.Empty;
    }

    private Guid ResolveTenantId()
    {
        var raw = User.FindFirst("tenant_id")?.Value;
        return Guid.TryParse(raw, out var value) ? value : Guid.Empty;
    }

    public sealed record IntelligenceEventRequest(
        string PredictionId,
        string DecisionId,
        string ActionId,
        string Outcome,
        DateTime? TimestampUtc,
        string? CorrelationId,
        string? MetadataJson);

    public sealed record IntelligenceMetricsDto(
        int TotalEvents,
        decimal PredictionAccuracyPercent,
        decimal ActionSuccessRatePercent,
        decimal IgnoredDecisionsPercent);
}

