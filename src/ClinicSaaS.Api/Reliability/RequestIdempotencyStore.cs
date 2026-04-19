using Microsoft.Extensions.Caching.Memory;

namespace ClinicSaaS.Api.Reliability;

public sealed class RequestIdempotencyStore
{
    private readonly IMemoryCache _cache;
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(30);

    public RequestIdempotencyStore(IMemoryCache cache)
    {
        _cache = cache;
    }

    public bool TryGetCreatedAppointmentId(string key, out Guid appointmentId)
        => _cache.TryGetValue($"appt:{key}", out appointmentId);

    public void RememberCreatedAppointmentId(string key, Guid appointmentId)
        => _cache.Set($"appt:{key}", appointmentId, Ttl);
}
