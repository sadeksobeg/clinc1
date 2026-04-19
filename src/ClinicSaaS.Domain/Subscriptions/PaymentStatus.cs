namespace ClinicSaaS.Domain.Subscriptions;

public enum PaymentStatus
{
    Pending = 0,
    Submitted = 1,
    UnderReview = 2,
    Confirmed = 3,
    Failed = 4,
    PartiallyPaid = 5,
    Refunded = 6,
    Disputed = 7
}

