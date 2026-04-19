using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Infrastructure.Persistence;
using ClinicSaaS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Controllers;

[ApiController]
[Route("api/platform/support")]
[Authorize(Policy = "PlatformOnly")]
[EnableRateLimiting("platform")]
public sealed class PlatformSupportController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly PlatformAuditService _audit;

    public PlatformSupportController(ClinicDbContext db, PlatformAuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet("conversations")]
    public async Task<ActionResult<IReadOnlyList<SupportConversationDto>>> Conversations(CancellationToken cancellationToken)
    {
        var tenants = await _db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);

        var rows = await _db.SupportConversations.IgnoreQueryFilters().AsNoTracking()
            .OrderByDescending(x => x.UpdatedAtUtc)
            .Take(300)
            .ToArrayAsync(cancellationToken);

        return Ok(rows.Select(x => new SupportConversationDto(
            x.Id,
            x.TenantId,
            tenants.GetValueOrDefault(x.TenantId, "Unknown"),
            x.Subject,
            x.Status,
            x.Priority,
            x.AssignedUserId,
            x.UnreadCount,
            x.CreatedAtUtc,
            x.UpdatedAtUtc)).ToArray());
    }

    [HttpGet("conversations/{conversationId:guid}/messages")]
    public async Task<ActionResult<IReadOnlyList<SupportMessageDto>>> Messages(Guid conversationId, CancellationToken cancellationToken)
    {
        var messages = await _db.SupportMessages.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.ConversationId == conversationId)
            .OrderBy(x => x.CreatedAtUtc)
            .Select(x => new SupportMessageDto(x.Id, x.ConversationId, x.SenderUserId, x.SenderType, x.Body, x.IsInternalNote, x.CreatedAtUtc))
            .ToArrayAsync(cancellationToken);
        return Ok(messages);
    }

    [HttpPost("reply")]
    public async Task<ActionResult> Reply([FromBody] ReplyRequest body, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(body.Body)) return BadRequest("Message body is required.");
        var conversation = await _db.SupportConversations.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == body.ConversationId, cancellationToken);
        if (conversation is null) return NotFound("Conversation not found.");

        _db.SupportMessages.Add(new SupportMessage
        {
            Id = Guid.NewGuid(),
            TenantId = conversation.TenantId,
            ConversationId = conversation.Id,
            SenderUserId = ResolveActorUserId(),
            SenderType = "Agent",
            Body = body.Body.Trim(),
            IsInternalNote = body.IsInternalNote,
            CreatedAtUtc = DateTime.UtcNow
        });

        conversation.UnreadCount = body.IsInternalNote ? conversation.UnreadCount : 0;
        conversation.UpdatedAtUtc = DateTime.UtcNow;
        if (conversation.Status == "Closed")
            conversation.Status = "Open";

        await _db.SaveChangesAsync(cancellationToken);
        await AuditAsync("SupportReply", "SupportConversation", conversation.Id.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("assign")]
    public async Task<ActionResult> Assign([FromBody] AssignRequest body, CancellationToken cancellationToken)
    {
        var conversation = await _db.SupportConversations.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == body.ConversationId, cancellationToken);
        if (conversation is null) return NotFound("Conversation not found.");
        conversation.AssignedUserId = body.AssignedUserId;
        if (!string.IsNullOrWhiteSpace(body.Priority))
            conversation.Priority = body.Priority.Trim();
        conversation.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        await AuditAsync("SupportAssigned", "SupportConversation", conversation.Id.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("close")]
    public async Task<ActionResult> Close([FromBody] CloseRequest body, CancellationToken cancellationToken)
    {
        var conversation = await _db.SupportConversations.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == body.ConversationId, cancellationToken);
        if (conversation is null) return NotFound("Conversation not found.");
        conversation.Status = "Closed";
        conversation.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        await AuditAsync("SupportClosed", "SupportConversation", conversation.Id.ToString(), cancellationToken);
        return Ok();
    }

    [HttpPost("conversations")]
    public async Task<ActionResult<SupportConversationDto>> CreateConversation([FromBody] CreateConversationRequest body, CancellationToken cancellationToken)
    {
        if (body.TenantId == Guid.Empty || string.IsNullOrWhiteSpace(body.Subject))
            return BadRequest("TenantId and Subject are required.");

        var exists = await _db.Tenants.IgnoreQueryFilters().AsNoTracking().AnyAsync(x => x.Id == body.TenantId, cancellationToken);
        if (!exists) return NotFound("Tenant not found.");

        var now = DateTime.UtcNow;
        var row = new SupportConversation
        {
            Id = Guid.NewGuid(),
            TenantId = body.TenantId,
            Subject = body.Subject.Trim(),
            Status = "Open",
            Priority = string.IsNullOrWhiteSpace(body.Priority) ? "Normal" : body.Priority.Trim(),
            UnreadCount = 0,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        _db.SupportConversations.Add(row);
        await _db.SaveChangesAsync(cancellationToken);
        await AuditAsync("SupportConversationCreated", "SupportConversation", row.Id.ToString(), cancellationToken);

        return Ok(new SupportConversationDto(row.Id, row.TenantId, string.Empty, row.Subject, row.Status, row.Priority, row.AssignedUserId, row.UnreadCount, row.CreatedAtUtc, row.UpdatedAtUtc));
    }

    private Guid? ResolveActorUserId()
    {
        var raw =
            User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(raw, out var userId) ? userId : null;
    }

    private async Task AuditAsync(string action, string entityType, string entityId, CancellationToken cancellationToken)
    {
        var actor = ResolveActorUserId();
        if (!actor.HasValue || actor.Value == Guid.Empty) return;
        await _audit.LogAsync(action, actor.Value, entityType, entityId, cancellationToken);
    }

    public sealed record SupportConversationDto(Guid Id, Guid TenantId, string TenantName, string Subject, string Status, string Priority, Guid? AssignedUserId, int UnreadCount, DateTime CreatedAtUtc, DateTime UpdatedAtUtc);
    public sealed record SupportMessageDto(Guid Id, Guid ConversationId, Guid? SenderUserId, string SenderType, string Body, bool IsInternalNote, DateTime CreatedAtUtc);
    public sealed record ReplyRequest(Guid ConversationId, string Body, bool IsInternalNote);
    public sealed record AssignRequest(Guid ConversationId, Guid? AssignedUserId, string? Priority);
    public sealed record CloseRequest(Guid ConversationId);
    public sealed record CreateConversationRequest(Guid TenantId, string Subject, string? Priority);
}
