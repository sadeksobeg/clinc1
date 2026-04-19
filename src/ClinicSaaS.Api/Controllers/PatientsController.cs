using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/patients")]
[Authorize(Policy = "ReceptionOrPlatform")]
public sealed class PatientsController : ControllerBase
{
    private readonly ClinicDbContext _db;

    public PatientsController(ClinicDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<Patient>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _db.Patients.AsNoTracking().OrderBy(p => p.Name).ToArrayAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<Patient>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        return patient is null ? NotFound() : Ok(patient);
    }

    [HttpPost]
    public async Task<ActionResult<Patient>> Create([FromBody] CreatePatientRequest request, CancellationToken cancellationToken)
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            PhoneNumber = request.PhoneNumber.Trim(),
            Notes = request.Notes ?? string.Empty
        };

        _db.Patients.Add(patient);
        await _db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = patient.Id }, patient);
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<Patient>> Patch(Guid id, [FromBody] UpdatePatientRequest request, CancellationToken cancellationToken)
    {
        var patient = await _db.Patients.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (patient is null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name))
            patient.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.PhoneNumber))
            patient.PhoneNumber = request.PhoneNumber.Trim();
        if (request.Notes is not null)
            patient.Notes = request.Notes;

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(patient);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var patient = await _db.Patients.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (patient is null)
            return NotFound();

        _db.Patients.Remove(patient);
        await _db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    public sealed record CreatePatientRequest(string Name, string PhoneNumber, string? Notes);

    public sealed record UpdatePatientRequest(string? Name, string? PhoneNumber, string? Notes);
}

