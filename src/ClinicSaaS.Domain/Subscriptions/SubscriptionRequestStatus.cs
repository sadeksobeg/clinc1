namespace ClinicSaaS.Domain.Subscriptions;

public enum SubscriptionRequestStatus
{
    Requested = 0,
    AwaitingPayment = 1,
    PaymentConfirmed = 2,
    Activated = 3,
    Rejected = 4
}
