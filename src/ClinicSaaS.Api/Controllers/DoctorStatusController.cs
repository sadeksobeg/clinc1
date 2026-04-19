using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Infrastructure.Persistence;
using ClinicSaaS.Infrastructure.Webhooks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/doctors/{doctorId:guid}/status")]
[Authorize(Policy = "TenantUser")]
public sealed class DoctorStatusController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly IWebhookQueue _webhookQueue;
    private readonly N8nOptions _n8nOptions;

    public DoctorStatusController(ClinicDbContext db, IWebhookQueue webhookQueue, IOptions<N8nOptions> n8nOptions)
    {
        _db = db;
        _webhookQueue = webhookQueue;
        _n8nOptions = n8nOptions.Value;
    }

    [HttpPost]
    public async Task<ActionResult<DoctorStatus>> SetStatus(
        Guid doctorId,
        [FromBody] SetDoctorStatusRequest request,
        CancellationToken cancellationToken)
    {
        var exists = await _db.Doctors.AnyAsync(d => d.Id == doctorId, cancellationToken);
        if (!exists)
            return NotFound("Doctor not found for this tenant.");

        if (!Enum.TryParse<DoctorStatusType>(request.Status, ignoreCase: true, out var status))
            return BadRequest("Invalid status.");

        var delayMinutes = status == DoctorStatusType.Delayed ? request.DelayMinutes ?? 0 : 0;

        if (status == DoctorStatusType.Delayed && delayMinutes <= 0)
            return BadRequest("DelayMinutes must be provided when status is Delayed.");

        var doctorStatus = new DoctorStatus
        {
            Id = Guid.NewGuid(),
            DoctorId = doctorId,
            Status = status,
            DelayMinutes = delayMinutes,
            RecordedAt = DateTimeOffset.UtcNow
        };

        _db.DoctorStatuses.Add(doctorStatus);
        await _db.SaveChangesAsync(cancellationToken);

        if (doctorStatus.Status == DoctorStatusType.Delayed)
        {
            await EnqueueDoctorDelayedWebhooksAsync(doctorStatus, cancellationToken);
        }

        return Ok(doctorStatus);
    }

    public sealed record SetDoctorStatusRequest(string Status, int? DelayMinutes);

    private async Task EnqueueDoctorDelayedWebhooksAsync(DoctorStatus doctorStatus, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var message =
            "نعتذر 🙏\n" +
            $"الدكتور متأخر {doctorStatus.DelayMinutes} دقيقة.\n\n" +
            "سيتم استقبالكم قريبًا.";

        // For each upcoming scheduled appointment, enqueue a separate webhook.
        var upcoming = await (from a in _db.Appointments.AsNoTracking()
                               join p in _db.Patients.AsNoTracking() on a.PatientId equals p.Id
                               join d in _db.Doctors.AsNoTracking() on a.DoctorId equals d.Id
                               where a.DoctorId == doctorStatus.DoctorId
                                     && a.Status == AppointmentStatus.Scheduled
                                     && a.StartTime > now
                               orderby a.StartTime
                               select new
                               {
                                   patientName = p.Name,
                                   phone = p.PhoneNumber,
                                   time = a.StartTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
                                   doctor = d.Name
                               }).ToArrayAsync(cancellationToken);

        foreach (var appt in upcoming)
        {
            var payload = new
            {
                patientName = appt.patientName,
                phone = appt.phone,
                time = appt.time,
                doctor = appt.doctor,
                message
            };

            await _webhookQueue.EnqueueAsync(
                new WebhookWorkItem(_n8nOptions.Paths.DoctorDelayedPath, payload),
                cancellationToken);
        }
    }
}

