using ClinicSaaS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Api.Product;

public sealed class EntitlementService
{
    private readonly ClinicDbContext _db;

    public EntitlementService(ClinicDbContext db)
    {
        _db = db;
    }

    public async Task<EntitlementSnapshot> GetSnapshotAsync(CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (tenant is null)
            return EntitlementSnapshot.Default;

        var plan = NormalizePlan(tenant.SubscriptionPlan);
        var addons = await _db.TenantAddonSubscriptions.AsNoTracking()
            .Join(_db.AddonCatalogItems.AsNoTracking(), s => s.AddonCatalogItemId, a => a.Id, (s, a) => new { a.Code, s.Quantity })
            .ToArrayAsync(cancellationToken);

        var addonCodes = addons.Select(x => x.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var extraConversationPacks = addons.Where(x => x.Code.Equals("extra_whatsapp_pack", StringComparison.OrdinalIgnoreCase))
            .Sum(x => x.Quantity);

        var baseCaps = plan switch
        {
            "Starter" => new PlanCaps(1, 1, 200),
            "Growth" => new PlanCaps(5, 3, 2000),
            "Pro" => new PlanCaps(int.MaxValue, int.MaxValue, int.MaxValue),
            _ => new PlanCaps(5, 3, 2000)
        };

        var conversationCap = baseCaps.MonthlyConversations == int.MaxValue
            ? int.MaxValue
            : baseCaps.MonthlyConversations + (extraConversationPacks * 1000);

        return new EntitlementSnapshot(
            plan,
            baseCaps.MaxDoctors,
            baseCaps.MaxReceptionists,
            conversationCap,
            HasCampaigns: plan == "Pro" || addonCodes.Contains("whatsapp_campaigns"),
            HasAdvancedAnalytics: plan != "Starter" || addonCodes.Contains("advanced_analytics"),
            HasApiAccess: plan == "Pro" || addonCodes.Contains("api_access"),
            HasWhiteLabel: addonCodes.Contains("white_label_branding"));
    }

    public static string NormalizePlan(string plan)
    {
        if (string.Equals(plan, "Starter", StringComparison.OrdinalIgnoreCase) || string.Equals(plan, "Basic", StringComparison.OrdinalIgnoreCase))
            return "Starter";
        if (string.Equals(plan, "Growth", StringComparison.OrdinalIgnoreCase) || string.Equals(plan, "Business", StringComparison.OrdinalIgnoreCase))
            return "Growth";
        if (string.Equals(plan, "Pro", StringComparison.OrdinalIgnoreCase) || string.Equals(plan, "Enterprise", StringComparison.OrdinalIgnoreCase))
            return "Pro";
        return "Growth";
    }

    public sealed record PlanCaps(int MaxDoctors, int MaxReceptionists, int MonthlyConversations);
    public sealed record EntitlementSnapshot(
        string Plan,
        int MaxDoctors,
        int MaxReceptionists,
        int MonthlyConversations,
        bool HasCampaigns,
        bool HasAdvancedAnalytics,
        bool HasApiAccess,
        bool HasWhiteLabel)
    {
        public static readonly EntitlementSnapshot Default = new("Growth", 5, 3, 2000, false, true, false, false);
    }
}

