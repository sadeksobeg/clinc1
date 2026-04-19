using System.Threading.Channels;

namespace ClinicSaaS.Infrastructure.Webhooks;

public sealed class WebhookQueue : IWebhookQueue
{
    private readonly Channel<WebhookWorkItem> _channel;

    public WebhookQueue(int capacity = 1000)
    {
        _channel = Channel.CreateBounded<WebhookWorkItem>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait
        });
    }

    public ValueTask EnqueueAsync(WebhookWorkItem item, CancellationToken cancellationToken = default)
        => _channel.Writer.WriteAsync(item, cancellationToken);

    public ChannelReader<WebhookWorkItem> Reader => _channel.Reader;
}

