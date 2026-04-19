namespace ClinicSaaS.Application.Appointments;

public sealed record CreateAppointmentRequest(
    Guid DoctorId,
    Guid PatientId,
    Guid VisitTypeId,
    DateTimeOffset StartTimeUtc);

