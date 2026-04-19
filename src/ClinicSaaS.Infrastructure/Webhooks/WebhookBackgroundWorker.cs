using System.Threading.Channels;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicSaaS.Infrastructure.Webhooks;

public sealed class WebhookBackgroundWorker : BackgroundService
{
    private readonly ChannelReader<WebhookWorkItem> _reader;
    private readonly N8nWebhookClient _client;
    private readonly ILogger<WebhookBackgroundWorker> _logger;
    private readonly N8nOptions _options;
    private readonly WorkerHeartbeatService _heartbeats;
    private readonly WebhookDeadLetterStore _deadLetters;

    public WebhookBackgroundWorker(
        WebhookQueue queue,
        N8nWebhookClient client,
        IOptions<N8nOptions> options,
        ILogger<WebhookBackgroundWorker> logger,
        WorkerHeartbeatService heartbeats,
        WebhookDeadLetterStore deadLetters)
    {
        _reader = queue.Reader;
        _client = client;
        _options = options.Value;
        _logger = logger;
        _heartbeats = heartbeats;
        _deadLetters = deadLetters;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeats.Mark(nameof(WebhookBackgroundWorker), DateTime.UtcNow);
            var item = await _reader.ReadAsync(stoppingToken);
            await TryDeliverWithRetries(item, stoppingToken);
        }
    }

    private async Task TryDeliverWithRetries(WebhookWorkItem item, CancellationToken cancellationToken)
    {
        // Simple exponential backoff (1s, 2s, 4s).
        const int maxAttempts = 3;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                linkedCts.CancelAfter(TimeSpan.FromSeconds(_options.TimeoutSeconds));
                await _client.SendAsync(item.Path, item.Payload, linkedCts.Token);
                return;
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                _logger.LogWarning(ex, "Failed to deliver webhook (attempt {Attempt}/{MaxAttempts}).", attempt, maxAttempts);
                var delaySeconds = (int)Math.Pow(2, attempt - 1);
                await Task.Delay(TimeSpan.FromSeconds(delaySeconds), cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to deliver webhook after max attempts. Path: {Path}", item.Path);
                _deadLetters.Add(item, ex.Message, DateTime.UtcNow);
                return;
            }
        }
    }
}

