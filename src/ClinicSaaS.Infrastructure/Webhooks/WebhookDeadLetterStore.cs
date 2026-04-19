using System.Collections.Concurrent;

namespace ClinicSaaS.Infrastructure.Webhooks;

public sealed class WebhookDeadLetterStore
{
    private readonly ConcurrentQueue<DeadLetterWebhookItem> _items = new();

    public void Add(WebhookWorkItem item, string reason, DateTime failedAtUtc)
    {
        _items.Enqueue(new DeadLetterWebhookItem(item.Path, item.Payload, reason, failedAtUtc));
        while (_items.Count > 500 && _items.TryDequeue(out _)) { }
    }

    public int Count => _items.Count;

    public IReadOnlyList<DeadLetterWebhookItem> Snapshot()
        => _items.ToArray();

    public sealed record DeadLetterWebhookItem(string Path, object Payload, string Reason, DateTime FailedAtUtc);
}

