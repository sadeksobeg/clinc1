namespace ClinicSaaS.Infrastructure.Webhooks;

public sealed class N8nOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 20;

    public WebhookPaths Paths { get; set; } = new();

    public sealed class WebhookPaths
    {
        public string AppointmentCreatedPath { get; set; } = "/webhooks/appointment-created";
        public string AppointmentUpdatedPath { get; set; } = "/webhooks/appointment-updated";
        public string DoctorDelayedPath { get; set; } = "/webhooks/doctor-delayed";
    }
}

