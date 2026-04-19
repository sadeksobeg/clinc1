using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Subscriptions;

namespace ClinicSaaS.Domain.Entities;

public sealed class LedgerEntry : Entity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid AccountId { get; set; }
    public string EntryType { get; set; } = LedgerEntryType.Debit.ToString();
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public string ReferenceType { get; set; } = string.Empty;
    public string ReferenceId { get; set; } = string.Empty;
    public DateTime PostedAtUtc { get; set; } = DateTime.UtcNow;
}

