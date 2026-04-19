using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ClinicSaaS.Api.Webhooks;
using ClinicSaaS.Api.Reliability;
using ClinicSaaS.Application.Appointments;
using ClinicSaaS.Application.Scheduling;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/appointments")]
[Authorize(Policy = "TenantUser")]
public sealed class AppointmentsController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly AppointmentBookingService _booking;
    private readonly AppointmentScheduler _scheduler;
    private readonly AppointmentWebhookEnqueuer _webhooks;
    private readonly RequestIdempotencyStore _idempotency;

    public AppointmentsController(
        ClinicDbContext db,
        AppointmentBookingService booking,
        AppointmentScheduler scheduler,
        AppointmentWebhookEnqueuer webhooks,
        RequestIdempotencyStore idempotency)
    {
        _db = db;
        _booking = booking;
        _scheduler = scheduler;
        _webhooks = webhooks;
        _idempotency = idempotency;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<Appointment>>> GetByDate(
        [FromQuery] DateOnly date,
        [FromQuery] Guid? doctorId,
        CancellationToken cancellationToken)
    {
        var from = new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var to = from.AddDays(1);

        var query = _db.Appointments.AsNoTracking()
            .Where(a => a.StartTime < to && a.EndTime > from);

        if (doctorId is not null)
            query = query.Where(a => a.DoctorId == doctorId.Value);

        var items = await query
            .OrderBy(a => a.StartTime)
            .ToArrayAsync(cancellationToken);

        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<Appointment>> Create([FromBody] CreateAppointmentRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var idemKey = Request.Headers["X-Idempotency-Key"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(idemKey) && _idempotency.TryGetCreatedAppointmentId(idemKey, out var existingId))
            {
                var existing = await _db.Appointments.AsNoTracking().FirstOrDefaultAsync(a => a.Id == existingId, cancellationToken);
                if (existing is not null)
                    return Ok(existing);
            }

            var created = await _booking.CreateAppointmentAsync(request, cancellationToken);
            if (!string.IsNullOrWhiteSpace(idemKey))
                _idempotency.RememberCreatedAppointmentId(idemKey, created.Id);
            await _webhooks.EnqueueAppointmentCreatedAsync(created, cancellationToken);
            return Ok(created);
        }
        catch (AppointmentSlotConflictException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> PatchStatus(
        Guid id,
        [FromBody] UpdateAppointmentStatusRequest request,
        CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<AppointmentStatus>(request.Status, ignoreCase: true, out var newStatus))
            return BadRequest(new { message = "Invalid status." });

        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (!Guid.TryParse(sub, out var userId))
            return Unauthorized();

        var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value;
        if (!Enum.TryParse<UserRole>(roleClaim, ignoreCase: true, out var role))
            return Unauthorized();

        try
        {
            await _booking.UpdateAppointmentStatusAsync(id, newStatus, userId, role, cancellationToken);
            var updated = await _db.Appointments.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
            if (updated is not null)
                await _webhooks.EnqueueAppointmentUpdatedAsync(updated, cancellationToken);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("cancel/{id:guid}")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            await _booking.CancelAppointmentAsync(id, cancellationToken);
            // After cancellation, send an "updated" webhook for the appointment.
            var cancelled = await _db.Appointments.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);

            if (cancelled is not null)
                await _webhooks.EnqueueAppointmentUpdatedAsync(cancelled, cancellationToken);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }

    [HttpPost("walk-in")]
    [HttpPost("walkin")]
    public async Task<ActionResult<Appointment>> WalkIn([FromBody] WalkInAppointmentRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var idemKey = Request.Headers["X-Idempotency-Key"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(idemKey) && _idempotency.TryGetCreatedAppointmentId(idemKey, out var existingId))
            {
                var existing = await _db.Appointments.AsNoTracking().FirstOrDefaultAsync(a => a.Id == existingId, cancellationToken);
                if (existing is not null)
                    return Ok(existing);
            }

            var created = await _booking.WalkInAsync(request, cancellationToken);
            if (!string.IsNullOrWhiteSpace(idemKey))
                _idempotency.RememberCreatedAppointmentId(idemKey, created.Id);
            await _webhooks.EnqueueAppointmentCreatedAsync(created, cancellationToken);
            return Ok(created);
        }
        catch (AppointmentSlotConflictException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("available-slots")]
    public async Task<ActionResult<IReadOnlyList<AvailableSlotDto>>> AvailableSlots(
        [FromBody] AvailableSlotsRequest request,
        CancellationToken cancellationToken)
    {
        var slots = await _scheduler.GetAvailableSlots(request.DoctorId, request.Date, request.VisitTypeId, cancellationToken);
        return Ok(slots);
    }

    public sealed record AvailableSlotsRequest(Guid DoctorId, DateOnly Date, Guid VisitTypeId);

    public sealed record UpdateAppointmentStatusRequest(string Status);
}

