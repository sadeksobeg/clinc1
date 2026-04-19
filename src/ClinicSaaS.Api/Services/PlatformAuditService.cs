using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Infrastructure.Persistence;

namespace ClinicSaaS.Api.Services;

public sealed class PlatformAuditService
{
    private readonly ClinicDbContext _db;

    public PlatformAuditService(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task LogAsync(string action, Guid actorUserId, string entityType, string entityId, CancellationToken cancellationToken = default)
    {
        _db.PlatformAuditLogs.Add(new PlatformAuditLog
        {
            Id = Guid.NewGuid(),
            Action = action,
            ActorUserId = actorUserId,
            EntityType = entityType,
            EntityId = entityId,
            Timestamp = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
    }
}
