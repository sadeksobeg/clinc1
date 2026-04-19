using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AppointmentOverlapConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Ensure GiST support for equality operators used in exclusion constraints.
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");

            // Prevent double booking for scheduled appointments only.
            // AppointmentStatus.Scheduled == 0 in our enum.
            migrationBuilder.Sql(@"
ALTER TABLE ""Appointments""
ADD CONSTRAINT ""Appointments_Doctor_Tenant_Overlap_Excl""
EXCLUDE USING gist (
  ""TenantId"" WITH =,
  ""DoctorId"" WITH =,
  tstzrange(""StartTime"", ""EndTime"") WITH &&
)
WHERE (""Status"" = 0);
");

            migrationBuilder.Sql(@"
CREATE INDEX IF NOT EXISTS ""IX_Appointments_Tenant_Doctor_StartTime""
ON ""Appointments"" (""TenantId"", ""DoctorId"", ""StartTime"");
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"ALTER TABLE ""Appointments"" DROP CONSTRAINT IF EXISTS ""Appointments_Doctor_Tenant_Overlap_Excl"";");
            migrationBuilder.Sql(@"DROP INDEX IF EXISTS ""IX_Appointments_Tenant_Doctor_StartTime"";");
        }
    }
}
