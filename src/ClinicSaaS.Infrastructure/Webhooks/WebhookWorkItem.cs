namespace ClinicSaaS.Infrastructure.Webhooks;

public sealed record WebhookWorkItem(string Path, object Payload);

