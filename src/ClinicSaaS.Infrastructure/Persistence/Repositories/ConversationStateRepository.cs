using System.Text.Json;
using ClinicSaaS.Application.WhatsApp;
using ClinicSaaS.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Infrastructure.Persistence.Repositories;

public sealed class ConversationStateRepository : IConversationStateRepository
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly ClinicDbContext _db;

    public ConversationStateRepository(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<ConversationState> GetOrCreateAsync(string phone, CancellationToken cancellationToken = default)
    {
        var key = NormalizePhone(phone);
        var existing = await _db.ConversationStates
            .FirstOrDefaultAsync(c => c.Phone == key, cancellationToken);

        if (existing is not null)
            return existing;

        var created = new ConversationState
        {
            Id = Guid.NewGuid(),
            Phone = key,
            State = "idle",
            Data = "{}",
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _db.ConversationStates.Add(created);
        await _db.SaveChangesAsync(cancellationToken);
        return created;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
        => _db.SaveChangesAsync(cancellationToken);

    public async Task<IReadOnlyList<ConversationState>> GetActiveHoldsAsync(
        string excludePhone, CancellationToken cancellationToken = default)
    {
        var key = NormalizePhone(excludePhone);
        var now = DateTimeOffset.UtcNow;

        // Pull conversations that could have an active hold (awaiting confirmation or name).
        var candidates = await _db.ConversationStates
            .Where(c => c.Phone != key &&
                        (c.State == "awaiting_confirm" || c.State == "awaiting_name"))
            .ToArrayAsync(cancellationToken);

        // Filter in-memory by deserialising the JSON data.
        return candidates
            .Where(c =>
            {
                try
                {
                    var data = JsonSerializer.Deserialize<ConversationFlowData>(c.Data, JsonOpts);
                    return data?.HeldUntilUtc is not null && data.HeldUntilUtc > now;
                }
                catch (JsonException)
                {
                    return false;
                }
            })
            .ToArray();
    }

    private static string NormalizePhone(string phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
            return string.Empty;

        var trimmed = phone.Trim();
        return string.Concat(trimmed.Where(c => !char.IsWhiteSpace(c)));
    }
}
