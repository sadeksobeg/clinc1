namespace ClinicSaaS.Domain.Subscriptions;

public enum SubscriptionLifecycleStatus
{
    Requested = 0,
    AwaitingPayment = 1,
    Active = 2,
    Suspended = 3,
    Cancelled = 4,
    Trial = 5,
    Expired = 6
}

