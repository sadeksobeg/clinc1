using ClinicSaaS.Api.Product;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/communications")]
[Authorize(Policy = "TenantUser")]
public sealed class CommunicationsController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly EntitlementService _entitlements;

    public CommunicationsController(ClinicDbContext db, EntitlementService entitlements)
    {
        _db = db;
        _entitlements = entitlements;
    }

    [HttpGet("conversations")]
    public async Task<ActionResult<IReadOnlyList<ConversationDto>>> Conversations(CancellationToken cancellationToken)
    {
        var items = await _db.CommunicationConversations.AsNoTracking()
            .OrderByDescending(x => x.UpdatedAtUtc)
            .Take(200)
            .Select(x => new ConversationDto(x.Id, x.Channel, x.ContactName, x.ContactPhone, x.Direction, x.MessagePreview, x.Status, x.UpdatedAtUtc))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpPost("conversations")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult> CreateConversation([FromBody] CreateConversationDto dto, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.ContactPhone) || string.IsNullOrWhiteSpace(dto.MessagePreview))
            return BadRequest("Contact and message are required.");

        var snapshot = await _entitlements.GetSnapshotAsync(cancellationToken);
        var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var usedThisMonth = await _db.CommunicationConversations.AsNoTracking()
            .CountAsync(x => x.CreatedAtUtc >= monthStart, cancellationToken);
        if (snapshot.MonthlyConversations != int.MaxValue && usedThisMonth >= snapshot.MonthlyConversations)
            return StatusCode(StatusCodes.Status402PaymentRequired, "Conversation limit reached. Upgrade plan or buy add-on pack.");

        _db.CommunicationConversations.Add(new CommunicationConversation
        {
            Id = Guid.NewGuid(),
            Channel = dto.Channel is "Telegram" ? "Telegram" : "WhatsApp",
            ContactName = dto.ContactName?.Trim() ?? string.Empty,
            ContactPhone = dto.ContactPhone.Trim(),
            Direction = "Outbound",
            MessagePreview = dto.MessagePreview.Trim(),
            Status = "Open",
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpGet("templates")]
    public async Task<ActionResult<IReadOnlyList<TemplateDto>>> Templates(CancellationToken cancellationToken)
    {
        var items = await _db.CommunicationTemplates.AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => new TemplateDto(x.Id, x.Code, x.Name, x.Channel, x.Body, x.IsActive))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpPost("templates")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult> UpsertTemplate([FromBody] UpsertTemplateDto dto, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.Code) || string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Body))
            return BadRequest("Code, name and body are required.");

        var existing = await _db.CommunicationTemplates.FirstOrDefaultAsync(x => x.Code == dto.Code, cancellationToken);
        if (existing is null)
        {
            _db.CommunicationTemplates.Add(new CommunicationTemplate
            {
                Id = Guid.NewGuid(),
                Code = dto.Code.Trim(),
                Name = dto.Name.Trim(),
                Channel = dto.Channel is "Telegram" ? "Telegram" : "WhatsApp",
                Body = dto.Body.Trim(),
                IsActive = dto.IsActive,
                CreatedAtUtc = DateTime.UtcNow
            });
        }
        else
        {
            existing.Name = dto.Name.Trim();
            existing.Channel = dto.Channel is "Telegram" ? "Telegram" : "WhatsApp";
            existing.Body = dto.Body.Trim();
            existing.IsActive = dto.IsActive;
        }
        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpGet("campaigns")]
    public async Task<ActionResult<IReadOnlyList<CampaignDto>>> Campaigns(CancellationToken cancellationToken)
    {
        var items = await _db.CommunicationCampaigns.AsNoTracking()
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(200)
            .Select(x => new CampaignDto(x.Id, x.Name, x.Channel, x.TemplateCode, x.TargetSegment, x.ScheduledAtUtc, x.Status, x.EstimatedRecipients, x.CreatedAtUtc))
            .ToArrayAsync(cancellationToken);
        return Ok(items);
    }

    [HttpPost("campaigns")]
    [Authorize(Policy = "TenantUser")]
    public async Task<ActionResult> CreateCampaign([FromBody] CreateCampaignDto dto, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.TemplateCode))
            return BadRequest("Name and template code are required.");

        var snapshot = await _entitlements.GetSnapshotAsync(cancellationToken);
        if (!snapshot.HasCampaigns)
            return StatusCode(StatusCodes.Status402PaymentRequired, "Campaigns feature requires Pro or campaigns add-on.");

        _db.CommunicationCampaigns.Add(new CommunicationCampaign
        {
            Id = Guid.NewGuid(),
            Name = dto.Name.Trim(),
            Channel = dto.Channel is "Telegram" ? "Telegram" : "WhatsApp",
            TemplateCode = dto.TemplateCode.Trim(),
            TargetSegment = string.IsNullOrWhiteSpace(dto.TargetSegment) ? "AllPatients" : dto.TargetSegment.Trim(),
            ScheduledAtUtc = dto.ScheduledAtUtc,
            Status = "Draft",
            EstimatedRecipients = Math.Max(0, dto.EstimatedRecipients),
            CreatedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    public sealed record ConversationDto(Guid Id, string Channel, string ContactName, string ContactPhone, string Direction, string MessagePreview, string Status, DateTime UpdatedAtUtc);
    public sealed record TemplateDto(Guid Id, string Code, string Name, string Channel, string Body, bool IsActive);
    public sealed record CampaignDto(Guid Id, string Name, string Channel, string TemplateCode, string TargetSegment, DateTime? ScheduledAtUtc, string Status, int EstimatedRecipients, DateTime CreatedAtUtc);
    public sealed record CreateConversationDto(string Channel, string? ContactName, string ContactPhone, string MessagePreview);
    public sealed record UpsertTemplateDto(string Code, string Name, string Channel, string Body, bool IsActive);
    public sealed record CreateCampaignDto(string Name, string Channel, string TemplateCode, string TargetSegment, DateTime? ScheduledAtUtc, int EstimatedRecipients);
}

