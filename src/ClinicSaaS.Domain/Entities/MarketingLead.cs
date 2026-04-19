using ClinicSaaS.Domain.Abstractions;

namespace ClinicSaaS.Domain.Entities;

public sealed class MarketingLead : Entity
{
    public string ClinicName { get; set; } = string.Empty;
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhone { get; set; } = string.Empty;
    public string PreferredChannel { get; set; } = "WhatsApp";
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
}
