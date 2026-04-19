using System.Collections.Concurrent;

namespace ClinicSaaS.Infrastructure.Webhooks;

public sealed class WorkerHeartbeatService
{
    private readonly ConcurrentDictionary<string, DateTime> _heartbeats = new(StringComparer.Ordinal);

    public void Mark(string workerName, DateTime utcNow)
    {
        _heartbeats[workerName] = utcNow;
    }

    public IReadOnlyDictionary<string, DateTime> Snapshot()
    {
        return _heartbeats.ToDictionary(x => x.Key, x => x.Value);
    }
}
