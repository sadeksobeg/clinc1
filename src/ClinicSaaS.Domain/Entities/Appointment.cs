using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Enums;

namespace ClinicSaaS.Domain.Entities;

public sealed class Appointment : Entity, ITenantEntity
{
    public Guid DoctorId { get; set; }
    public Guid PatientId { get; set; }
    public Guid VisitTypeId { get; set; }

    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset EndTime { get; set; }
    public DateOnly QueueDate { get; set; }
    public int QueueNumber { get; set; }

    public AppointmentStatus Status { get; set; }

    public Guid TenantId { get; set; }
}

