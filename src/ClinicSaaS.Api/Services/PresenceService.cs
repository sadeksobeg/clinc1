using Microsoft.Extensions.Caching.Memory;

namespace ClinicSaaS.Api.Services;

public sealed class PresenceService
{
    private const string KeyPrefix = "presence:lastseen:";
    private readonly IMemoryCache _cache;
    private readonly object _lock = new();
    private readonly Dictionary<Guid, PresenceTouch> _dirtyTouches = new();

    public PresenceService(IMemoryCache cache)
    {
        _cache = cache;
    }

    public void Touch(Guid userId, Guid tenantId, DateTime nowUtc)
    {
        _cache.Set($"{KeyPrefix}{userId}", nowUtc, TimeSpan.FromMinutes(5));

        lock (_lock)
        {
            _dirtyTouches[userId] = new PresenceTouch(userId, tenantId, nowUtc);
        }
    }

    public IReadOnlyList<PresenceTouch> DrainDirtyTouches()
    {
        lock (_lock)
        {
            if (_dirtyTouches.Count == 0)
                return Array.Empty<PresenceTouch>();

            var entries = _dirtyTouches.Values.ToArray();
            _dirtyTouches.Clear();
            return entries;
        }
    }

    public DateTime? TryGetLastSeen(Guid userId)
    {
        return _cache.TryGetValue($"{KeyPrefix}{userId}", out DateTime lastSeen) ? lastSeen : null;
    }

    public sealed record PresenceTouch(Guid UserId, Guid TenantId, DateTime LastSeenAtUtc);
}
