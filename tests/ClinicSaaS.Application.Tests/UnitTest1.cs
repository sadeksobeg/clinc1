using ClinicSaaS.Application.Appointments;
using ClinicSaaS.Application.Patients;
using ClinicSaaS.Application.Scheduling;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.Enums;
using ClinicSaaS.Domain.WorkingHours;
using Xunit;

namespace ClinicSaaS.Application.Tests;

public sealed class UnitTest1
{
    [Fact]
    public async Task GetAvailableSlots_BlocksOverlaps_RespectsWorkingHoursAndDuration()
    {
        // Monday window: 09:00-10:00, duration 30 minutes, step 5 minutes.
        var date = new DateOnly(2026, 3, 30); // Monday (DayOfWeek = 1)
        var workingHours = new WorkingHours
        {
            Days = new List<WorkingHoursDay>
            {
                new WorkingHoursDay
                {
                    DayOfWeek = (int)date.DayOfWeek,
                    Windows = new List<WorkingHoursWindow>
                    {
                        new WorkingHoursWindow { Start = new TimeOnly(9, 0), End = new TimeOnly(10, 0) }
                    }
                }
            }
        };

        var existing = new List<Appointment>
        {
            new Appointment
            {
                Id = Guid.NewGuid(),
                DoctorId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                VisitTypeId = Guid.NewGuid(),
                StartTime = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero),
                EndTime = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero),
                Status = AppointmentStatus.Scheduled,
                TenantId = Guid.NewGuid()
            }
        };

        var doctorId = existing[0].DoctorId;
        var visitTypeId = Guid.NewGuid();

        var data = new FakeSchedulerData(workingHours, durationMinutes: 30, existingAppointments: existing);
        var scheduler = new AppointmentScheduler(data);

        var slots = await scheduler.GetAvailableSlots(doctorId, date, visitTypeId);

        Assert.Single(slots);

        var expectedStart = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero);
        var expectedEnd = new DateTimeOffset(date.ToDateTime(new TimeOnly(10, 0)), TimeSpan.Zero);

        Assert.Equal(expectedStart, slots[0].StartTime);
        Assert.Equal(expectedEnd, slots[0].EndTime);
    }

    [Fact]
    public async Task GetNearestAvailableSlot_ReturnsFirstSlotAtOrAfterFromDateTime()
    {
        var date = new DateOnly(2026, 3, 30); // Monday

        var workingHours = new WorkingHours
        {
            Days = new List<WorkingHoursDay>
            {
                new WorkingHoursDay
                {
                    DayOfWeek = (int)date.DayOfWeek,
                    Windows = new List<WorkingHoursWindow>
                    {
                        new WorkingHoursWindow { Start = new TimeOnly(9, 0), End = new TimeOnly(10, 0) }
                    }
                }
            }
        };

        var existing = new List<Appointment>
        {
            new Appointment
            {
                Id = Guid.NewGuid(),
                DoctorId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                VisitTypeId = Guid.NewGuid(),
                StartTime = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero),
                EndTime = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero),
                Status = AppointmentStatus.Scheduled,
                TenantId = Guid.NewGuid()
            }
        };

        var doctorId = existing[0].DoctorId;
        var visitTypeId = Guid.NewGuid();

        var data = new FakeSchedulerData(workingHours, durationMinutes: 30, existingAppointments: existing);
        var scheduler = new AppointmentScheduler(data);

        // From 09:10 -> earliest available non-overlapping is 09:30.
        var from = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 10)), TimeSpan.Zero);
        var slot = await scheduler.GetNearestAvailableSlot(doctorId, from, visitTypeId);

        Assert.NotNull(slot);
        Assert.Equal(new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero), slot!.StartTime);
    }

    [Fact]
    public async Task CreateAppointmentAsync_OverlappingStart_ThrowsAppointmentSlotConflictException()
    {
        var date = new DateOnly(2026, 3, 30); // Monday

        var workingHours = new WorkingHours
        {
            Days = new List<WorkingHoursDay>
            {
                new WorkingHoursDay
                {
                    DayOfWeek = (int)date.DayOfWeek,
                    Windows = new List<WorkingHoursWindow>
                    {
                        new WorkingHoursWindow { Start = new TimeOnly(9, 0), End = new TimeOnly(10, 0) }
                    }
                }
            }
        };

        var doctorId = Guid.NewGuid();
        var conflictingAppointment = new Appointment
        {
            Id = Guid.NewGuid(),
            DoctorId = doctorId,
            PatientId = Guid.NewGuid(),
            VisitTypeId = Guid.NewGuid(),
            StartTime = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero),
            EndTime = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero),
            Status = AppointmentStatus.Scheduled,
            TenantId = Guid.NewGuid()
        };

        var existing = new List<Appointment> { conflictingAppointment };
        var visitTypeId = Guid.NewGuid();

        var data = new FakeSchedulerData(workingHours, durationMinutes: 30, existingAppointments: existing);
        var scheduler = new AppointmentScheduler(data);

        var booking = new AppointmentBookingService(
            schedulerData: data,
            scheduler: scheduler,
            appointmentRepository: new NoopAppointmentRepository(),
            patientRepository: new NoopPatientRepository());

        var request = new CreateAppointmentRequest(
            DoctorId: doctorId,
            PatientId: Guid.NewGuid(),
            VisitTypeId: visitTypeId,
            StartTimeUtc: new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 5)), TimeSpan.Zero));

        await Assert.ThrowsAsync<AppointmentSlotConflictException>(() => booking.CreateAppointmentAsync(request));
    }

    private sealed class FakeSchedulerData : IAppointmentSchedulerData
    {
        private readonly WorkingHours _workingHours;
        private readonly int _durationMinutes;
        private readonly IReadOnlyList<Appointment> _existingAppointments;

        public FakeSchedulerData(WorkingHours workingHours, int durationMinutes, IReadOnlyList<Appointment> existingAppointments)
        {
            _workingHours = workingHours;
            _durationMinutes = durationMinutes;
            _existingAppointments = existingAppointments;
        }

        public Task<WorkingHours> GetDoctorWorkingHoursAsync(Guid doctorId, CancellationToken cancellationToken)
            => Task.FromResult(_workingHours);

        public Task<int> GetVisitTypeDurationMinutesAsync(Guid visitTypeId, CancellationToken cancellationToken)
            => Task.FromResult(_durationMinutes);

        public Task<IReadOnlyList<Appointment>> GetScheduledAppointmentsForDoctorAsync(
            Guid doctorId,
            DateOnly date,
            CancellationToken cancellationToken)
            => Task.FromResult(_existingAppointments);

        public Task<IReadOnlyList<(Guid Id, string Name)>> ListDoctorsAsync(CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyList<(Guid Id, string Name)>>(Array.Empty<(Guid Id, string Name)>());

        public Task<string> GetDoctorDisplayNameAsync(Guid doctorId, CancellationToken cancellationToken = default)
            => Task.FromResult("Doctor");

        public Task<IReadOnlyList<(Guid Id, string Name)>> ListVisitTypesAsync(CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyList<(Guid Id, string Name)>>(Array.Empty<(Guid Id, string Name)>());

        public Task<string> GetTenantTimeZoneIdAsync(CancellationToken cancellationToken = default)
            => Task.FromResult("UTC");

        public Task<Guid?> GetDoctorIdByLinkedUserAsync(Guid userId, CancellationToken cancellationToken = default)
            => Task.FromResult<Guid?>(null);
    }

    private sealed class NoopAppointmentRepository : IAppointmentRepository
    {
        public Task<Appointment> CreateAsync(Appointment appointment, CancellationToken cancellationToken)
            => throw new NotImplementedException("Should not reach repository when conflict is detected.");

        public Task CancelAsync(Guid appointmentId, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task<Appointment?> GetByIdAsync(Guid appointmentId, CancellationToken cancellationToken)
            => Task.FromResult<Appointment?>(null);

        public Task SetStatusAsync(Guid appointmentId, AppointmentStatus status, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task<IReadOnlyList<(Appointment Appointment, string DoctorName, string VisitTypeName)>> GetUpcomingByPhoneAsync(
            string phone, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<(Appointment, string, string)>>(Array.Empty<(Appointment, string, string)>());
    }

    private sealed class NoopPatientRepository : IPatientRepository
    {
        public Task<Patient> CreateAsync(Patient patient, CancellationToken cancellationToken)
            => throw new NotImplementedException();

        public Task DeleteAsync(Guid patientId, CancellationToken cancellationToken = default)
            => Task.CompletedTask;
    }
}