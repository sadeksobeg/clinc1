using ClinicSaaS.Infrastructure.Persistence;
using ClinicSaaS.Infrastructure.Webhooks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

namespace ClinicSaaS.Api.Services;

public sealed class PresenceSyncBackgroundService : BackgroundService
{
    private static readonly TimeSpan SyncInterval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan OfflineWindow = TimeSpan.FromMinutes(2);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly PresenceService _presence;
    private readonly ILogger<PresenceSyncBackgroundService> _logger;
    private readonly WorkerHeartbeatService _heartbeats;

    public PresenceSyncBackgroundService(
        IServiceScopeFactory scopeFactory,
        PresenceService presence,
        ILogger<PresenceSyncBackgroundService> logger,
        WorkerHeartbeatService heartbeats)
    {
        _scopeFactory = scopeFactory;
        _presence = presence;
        _logger = logger;
        _heartbeats = heartbeats;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(SyncInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
                _heartbeats.Mark(nameof(PresenceSyncBackgroundService), DateTime.UtcNow);
                await SyncAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Presence sync background service failed.");
            }
        }
    }

    private async Task SyncAsync(CancellationToken cancellationToken)
    {
        var touches = _presence.DrainDirtyTouches();

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ClinicDbContext>();
        var now = DateTime.UtcNow;

        if (touches.Count > 0)
        {
            var ids = touches.Select(x => x.UserId).ToArray();
            var users = await db.Users.IgnoreQueryFilters().Where(x => ids.Contains(x.Id)).ToArrayAsync(cancellationToken);

            foreach (var user in users)
            {
                var touch = touches.FirstOrDefault(x => x.UserId == user.Id);
                if (touch is null) continue;
                user.LastSeenAt = touch.LastSeenAtUtc;
                user.IsOnline = true;

                if (touch.TenantId != Guid.Empty)
                {
                    var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == touch.TenantId, cancellationToken);
                    if (tenant is not null)
                        tenant.LastActivityAt = touch.LastSeenAtUtc;
                }
            }
        }

        var staleUsers = await db.Users.IgnoreQueryFilters()
            .Where(x => x.IsOnline && x.LastSeenAt.HasValue && x.LastSeenAt < now - OfflineWindow)
            .ToArrayAsync(cancellationToken);

        foreach (var staleUser in staleUsers)
            staleUser.IsOnline = false;

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync(cancellationToken);
    }
}
