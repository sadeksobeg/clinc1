namespace ClinicSaaS.Application.Appointments;

public sealed class AppointmentSlotConflictException : Exception
{
    public AppointmentSlotConflictException(string message) : base(message)
    {
    }
}

