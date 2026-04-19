using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Infrastructure.Persistence;
using ClinicSaaS.Infrastructure.Webhooks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicSaaS.Api.Webhooks;

public sealed class AppointmentWebhookEnqueuer
{
    private readonly ClinicDbContext _db;
    private readonly IWebhookQueue _webhookQueue;
    private readonly N8nOptions _n8nOptions;

    public AppointmentWebhookEnqueuer(
        ClinicDbContext db,
        IWebhookQueue webhookQueue,
        IOptions<N8nOptions> n8nOptions)
    {
        _db = db;
        _webhookQueue = webhookQueue;
        _n8nOptions = n8nOptions.Value;
    }

    public Task EnqueueAppointmentCreatedAsync(Appointment appointment, CancellationToken cancellationToken)
        => EnqueueAsync(_n8nOptions.Paths.AppointmentCreatedPath, appointment, cancellationToken);

    public Task EnqueueAppointmentUpdatedAsync(Appointment appointment, CancellationToken cancellationToken)
        => EnqueueAsync(_n8nOptions.Paths.AppointmentUpdatedPath, appointment, cancellationToken);

    private async Task EnqueueAsync(string path, Appointment appointment, CancellationToken cancellationToken)
    {
        var patient = await _db.Patients.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == appointment.PatientId, cancellationToken);
        var doctor = await _db.Doctors.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == appointment.DoctorId, cancellationToken);

        if (patient is null || doctor is null)
            return;

        var payload = new
        {
            patientName = patient.Name,
            phone = patient.PhoneNumber,
            time = appointment.StartTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
            doctor = doctor.Name
        };

        await _webhookQueue.EnqueueAsync(new WebhookWorkItem(path, payload), cancellationToken);
    }
}
