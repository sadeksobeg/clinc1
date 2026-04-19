using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SeedData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Dev seed data: one tenant + a few users/doctors/visit types.
            // Password hash format matches ClinicSaaS.Api.Auth.PasswordHasher.
            var tenantId = "11111111-1111-1111-1111-111111111111";
            var adminUserId = "22222222-2222-2222-2222-222222222222";
            var receptionistUserId = "33333333-3333-3333-3333-333333333333";
            var doctorUserId = "44444444-4444-4444-4444-444444444444";
            var doctorId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
            var consultationId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
            var followUpId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
            var emergencyId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
            var doctorStatusId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

            var passwordHash = "120000.AQIDBAUGBwgJCgsMDQ4PEA==.zFCKjj8qmbXKUDAmjH+7m1VQ/n9MHK2w2Slw5hzzwe4=";

            var nowUtc = "NOW()";
            var workingHoursJson = @"{
  ""days"": [
    { ""dayOfWeek"": 1, ""windows"": [ { ""start"": ""09:00"", ""end"": ""17:00"" } ] },
    { ""dayOfWeek"": 2, ""windows"": [ { ""start"": ""09:00"", ""end"": ""17:00"" } ] },
    { ""dayOfWeek"": 3, ""windows"": [ { ""start"": ""09:00"", ""end"": ""17:00"" } ] },
    { ""dayOfWeek"": 4, ""windows"": [ { ""start"": ""09:00"", ""end"": ""17:00"" } ] },
    { ""dayOfWeek"": 5, ""windows"": [ { ""start"": ""09:00"", ""end"": ""17:00"" } ] }
  ]
}";

            migrationBuilder.Sql($@"
INSERT INTO ""Tenants"" (""Id"", ""Name"", ""SubscriptionPlan"", ""CreatedAt"")
VALUES ('{tenantId}', 'Acme Clinic', 'Basic', {nowUtc})
ON CONFLICT (""Id"") DO NOTHING;
");

            migrationBuilder.Sql($@"
INSERT INTO ""Users"" (""Id"", ""Name"", ""Email"", ""PasswordHash"", ""Role"", ""TenantId"")
VALUES
  ('{adminUserId}', 'Tenant Admin', 'admin@acme.dev', '{passwordHash}', 0, '{tenantId}'),
  ('{receptionistUserId}', 'Reception', 'reception@acme.dev', '{passwordHash}', 2, '{tenantId}'),
  ('{doctorUserId}', 'Doctor Login', 'doctor@acme.dev', '{passwordHash}', 1, '{tenantId}')
ON CONFLICT (""Id"") DO NOTHING;
");

            migrationBuilder.Sql($@"
INSERT INTO ""Doctors"" (""Id"", ""Name"", ""Specialty"", ""WorkingHours"", ""TenantId"")
VALUES
  ('{doctorId}', 'Dr. Sara', 'Cardiology', '{workingHoursJson}'::jsonb, '{tenantId}')
ON CONFLICT (""Id"") DO NOTHING;
");

            migrationBuilder.Sql($@"
INSERT INTO ""VisitTypes"" (""Id"", ""Name"", ""DurationMinutes"", ""TenantId"")
VALUES
  ('{consultationId}', 'Consultation', 30, '{tenantId}'),
  ('{followUpId}', 'Follow-up', 20, '{tenantId}'),
  ('{emergencyId}', 'Emergency', 15, '{tenantId}')
ON CONFLICT (""Id"") DO NOTHING;
");

            migrationBuilder.Sql($@"
INSERT INTO ""DoctorStatuses"" (""Id"", ""DoctorId"", ""Status"", ""DelayMinutes"", ""TenantId"")
VALUES
  ('{doctorStatusId}', '{doctorId}', 0, 0, '{tenantId}')
ON CONFLICT (""Id"") DO NOTHING;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DELETE FROM ""DoctorStatuses"" WHERE ""Id"" IN (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
);");

            migrationBuilder.Sql(@"DELETE FROM ""Doctors"" WHERE ""Id"" IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);");

            migrationBuilder.Sql(@"DELETE FROM ""VisitTypes"" WHERE ""Id"" IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-dddd-dddd-dddd-dddddddddddd'
);");

            migrationBuilder.Sql(@"DELETE FROM ""Users"" WHERE ""Id"" IN (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444'
);");

            migrationBuilder.Sql(@"DELETE FROM ""Tenants"" WHERE ""Id"" = '11111111-1111-1111-1111-111111111111';");
        }
    }
}
