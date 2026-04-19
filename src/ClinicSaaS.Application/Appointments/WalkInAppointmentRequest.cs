namespace ClinicSaaS.Application.Appointments;

public sealed record WalkInAppointmentRequest(
    Guid? DoctorId,
    Guid VisitTypeId,
    string PatientName,
    string PhoneNumber,
    string Notes,
    DateTimeOffset? FromDateTimeUtc);

