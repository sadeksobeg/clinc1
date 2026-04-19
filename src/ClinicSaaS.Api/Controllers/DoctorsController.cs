using System.IdentityModel.Tokens.Jwt;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Api.Product;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/doctors")]
[Authorize]
public sealed class DoctorsController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly EntitlementService _entitlements;

    public DoctorsController(ClinicDbContext db, EntitlementService entitlements)
    {
        _db = db;
        _entitlements = entitlements;
    }

    [HttpGet("statuses/latest")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult<IReadOnlyList<DoctorStatusLatestDto>>> GetLatestStatuses(CancellationToken cancellationToken)
    {
        var doctors = await _db.Doctors.AsNoTracking().OrderBy(d => d.Name)
            .Select(d => new { d.Id, d.Name })
            .ToArrayAsync(cancellationToken);

        var statuses = await _db.DoctorStatuses.AsNoTracking()
            .OrderByDescending(s => s.RecordedAt)
            .ToArrayAsync(cancellationToken);

        var latestByDoctor = new Dictionary<Guid, DoctorStatus>();
        foreach (var s in statuses)
        {
            if (!latestByDoctor.ContainsKey(s.DoctorId))
                latestByDoctor[s.DoctorId] = s;
        }

        var result = doctors.Select(d =>
        {
            latestByDoctor.TryGetValue(d.Id, out var st);
            return new DoctorStatusLatestDto(
                d.Id,
                d.Name,
                st?.Status,
                st?.DelayMinutes,
                st?.RecordedAt);
        }).ToArray();

        return Ok(result);
    }

    [HttpGet("me")]
    [Authorize(Policy = "DoctorOnly")]
    public async Task<ActionResult<Doctor>> GetMe(CancellationToken cancellationToken)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (!Guid.TryParse(sub, out var userId))
            return Unauthorized();

        var doctor = await _db.Doctors.AsNoTracking().FirstOrDefaultAsync(d => d.LinkedUserId == userId, cancellationToken);
        return doctor is null ? NotFound("No doctor profile linked to this user.") : Ok(doctor);
    }

    [HttpGet]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult<IReadOnlyList<Doctor>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _db.Doctors.AsNoTracking().OrderBy(d => d.Name).ToArrayAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult<Doctor>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var doctor = await _db.Doctors.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        return doctor is null ? NotFound() : Ok(doctor);
    }

    [HttpPost]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult<Doctor>> Create([FromBody] CreateDoctorRequest request, CancellationToken cancellationToken)
    {
        var e = await _entitlements.GetSnapshotAsync(cancellationToken);
        if (e.MaxDoctors != int.MaxValue)
        {
            var count = await _db.Doctors.AsNoTracking().CountAsync(cancellationToken);
            if (count >= e.MaxDoctors)
                return StatusCode(StatusCodes.Status402PaymentRequired, $"Doctor seat limit reached for plan {e.Plan}.");
        }

        var doctor = new Doctor
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Specialty = request.Specialty.Trim(),
            WorkingHours = request.WorkingHours
        };

        _db.Doctors.Add(doctor);
        await _db.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = doctor.Id }, doctor);
    }

    [HttpPatch("{id:guid}")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult<Doctor>> Patch(Guid id, [FromBody] UpdateDoctorRequest request, CancellationToken cancellationToken)
    {
        var doctor = await _db.Doctors.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (doctor is null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name))
            doctor.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.Specialty))
            doctor.Specialty = request.Specialty.Trim();
        if (request.WorkingHours is not null)
            doctor.WorkingHours = request.WorkingHours;

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(doctor);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var doctor = await _db.Doctors.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (doctor is null)
            return NotFound();

        _db.Doctors.Remove(doctor);
        await _db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    public sealed record CreateDoctorRequest(string Name, string Specialty, ClinicSaaS.Domain.WorkingHours.WorkingHours WorkingHours);

    public sealed record UpdateDoctorRequest(string? Name, string? Specialty, ClinicSaaS.Domain.WorkingHours.WorkingHours? WorkingHours);

    public sealed record DoctorStatusLatestDto(
        Guid DoctorId,
        string DoctorName,
        DoctorStatusType? Status,
        int? DelayMinutes,
        DateTimeOffset? RecordedAt);
}

