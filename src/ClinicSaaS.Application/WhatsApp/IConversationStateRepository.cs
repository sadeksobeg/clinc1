using ClinicSaaS.Domain.Entities;

namespace ClinicSaaS.Application.WhatsApp;

public interface IConversationStateRepository
{
    Task<ConversationState> GetOrCreateAsync(string phone, CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);

    /// <summary>Returns conversation states that are currently holding a slot (HeldUntilUtc &gt; UtcNow), excluding the given phone.</summary>
    Task<IReadOnlyList<ConversationState>> GetActiveHoldsAsync(string excludePhone, CancellationToken cancellationToken = default);
}
