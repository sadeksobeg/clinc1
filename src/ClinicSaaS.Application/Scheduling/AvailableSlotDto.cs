namespace ClinicSaaS.Application.Scheduling;

public sealed class AvailableSlotDto
{
    public Guid DoctorId { get; set; }

    public string DoctorName { get; set; } = string.Empty;

    public DateTimeOffset StartTime { get; set; }

    public DateTimeOffset EndTime { get; set; }
}

