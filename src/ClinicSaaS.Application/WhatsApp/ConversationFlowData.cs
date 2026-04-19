namespace ClinicSaaS.Application.WhatsApp;

public sealed class ConversationFlowData
{
    public Guid? VisitTypeId { get; set; }

    public string? VisitTypeName { get; set; }

    public List<SlotOptionJson>? Slots { get; set; }

    public Guid? PickedDoctorId { get; set; }

    public string? PickedDoctorName { get; set; }

    public DateTimeOffset? PickedStartUtc { get; set; }

    /// <summary>When set, this conversation is holding a slot until this time (UTC). Other conversations skip this slot.</summary>
    public DateTimeOffset? HeldUntilUtc { get; set; }

    /// <summary>AppointmentId of the upcoming appointment to cancel (awaiting_cancel_confirm state).</summary>
    public Guid? CancelAppointmentId { get; set; }

    /// <summary>Human-readable line for cancel confirmation after picking from a multi-appointment list.</summary>
    public string? PendingCancelSummary { get; set; }
}

public sealed class SlotOptionJson
{
    public int N { get; set; }

    public Guid DoctorId { get; set; }

    public string DoctorName { get; set; } = string.Empty;

    /// <summary>Optional; used when listing upcoming appointments for cancel flow.</summary>
    public string? VisitTypeName { get; set; }

    public DateTimeOffset Start { get; set; }

    public DateTimeOffset End { get; set; }
}
