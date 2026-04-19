namespace ClinicSaaS.Application.WhatsApp;

public sealed record WhatsAppIncomingRequest(string Phone, string Message);

public sealed record WhatsAppIncomingResponse(string Reply, string State, Guid? AppointmentId);
