using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/visitTypes")]
[Authorize]
public sealed class VisitTypesController : ControllerBase
{
    private readonly ClinicDbContext _db;

    public VisitTypesController(ClinicDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult<IReadOnlyList<VisitType>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _db.VisitTypes.AsNoTracking().OrderBy(v => v.Name).ToArrayAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult<VisitType>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var visitType = await _db.VisitTypes.AsNoTracking().FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
        return visitType is null ? NotFound() : Ok(visitType);
    }

    [HttpPost]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult<VisitType>> Create([FromBody] CreateVisitTypeRequest request, CancellationToken cancellationToken)
    {
        var visitType = new VisitType
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            DurationMinutes = request.DurationMinutes
        };

        _db.VisitTypes.Add(visitType);
        await _db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = visitType.Id }, visitType);
    }

    [HttpPatch("{id:guid}")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<ActionResult<VisitType>> Patch(Guid id, [FromBody] UpdateVisitTypeRequest request, CancellationToken cancellationToken)
    {
        var visitType = await _db.VisitTypes.FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
        if (visitType is null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name))
            visitType.Name = request.Name.Trim();
        if (request.DurationMinutes.HasValue)
            visitType.DurationMinutes = request.DurationMinutes.Value;

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(visitType);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "PlatformOnly")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var visitType = await _db.VisitTypes.FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
        if (visitType is null)
            return NotFound();

        _db.VisitTypes.Remove(visitType);
        await _db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    public sealed record CreateVisitTypeRequest(string Name, int DurationMinutes);
    public sealed record UpdateVisitTypeRequest(string? Name, int? DurationMinutes);
}

