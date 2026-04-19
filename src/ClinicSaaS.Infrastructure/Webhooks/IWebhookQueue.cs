namespace ClinicSaaS.Infrastructure.Webhooks;

public interface IWebhookQueue
{
    ValueTask EnqueueAsync(WebhookWorkItem item, CancellationToken cancellationToken = default);
}

