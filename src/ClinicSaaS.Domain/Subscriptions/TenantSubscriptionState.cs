namespace ClinicSaaS.Domain.Subscriptions;

public enum TenantSubscriptionState
{
    TrialActive = 0,
    Active = 1,
    Suspended = 2,
    Cancelled = 3,
    Expired = 4,
    Rejected = 5,
    Pending = 6
}
