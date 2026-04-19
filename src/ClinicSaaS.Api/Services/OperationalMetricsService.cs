using System.Collections.Concurrent;

namespace ClinicSaaS.Api.Services;

public sealed class OperationalMetricsService
{
    private long _requestCount;
    private long _errorCount;
    private long _authSuccessCount;
    private long _authFailureCount;
    private readonly ConcurrentQueue<int> _latencyMs = new();

    public void RecordRequest(int statusCode, int latencyMs)
    {
        Interlocked.Increment(ref _requestCount);
        if (statusCode >= 500) Interlocked.Increment(ref _errorCount);
        _latencyMs.Enqueue(latencyMs);
        while (_latencyMs.Count > 2000 && _latencyMs.TryDequeue(out _)) { }
    }

    public void RecordAuth(bool success)
    {
        if (success) Interlocked.Increment(ref _authSuccessCount);
        else Interlocked.Increment(ref _authFailureCount);
    }

    public MetricsSnapshot Snapshot()
    {
        var sample = _latencyMs.ToArray();
        Array.Sort(sample);
        var p95 = sample.Length == 0 ? 0 : sample[(int)Math.Clamp(Math.Ceiling(sample.Length * 0.95) - 1, 0, sample.Length - 1)];
        var requests = Interlocked.Read(ref _requestCount);
        var errors = Interlocked.Read(ref _errorCount);
        var authSuccess = Interlocked.Read(ref _authSuccessCount);
        var authFailure = Interlocked.Read(ref _authFailureCount);
        var errorRate = requests == 0 ? 0 : Math.Round((errors * 100m) / requests, 2);
        var authRate = (authSuccess + authFailure) == 0 ? 0 : Math.Round((authSuccess * 100m) / (authSuccess + authFailure), 2);
        return new MetricsSnapshot(requests, errors, errorRate, p95, authSuccess, authFailure, authRate);
    }

    public sealed record MetricsSnapshot(
        long TotalRequests,
        long ErrorCount,
        decimal ErrorRatePercent,
        int LatencyP95Ms,
        long AuthSuccessCount,
        long AuthFailureCount,
        decimal AuthSuccessRatePercent);
}

