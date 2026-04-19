using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAppointmentPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Appointments_TenantId_DoctorId_StartTime",
                table: "Appointments",
                columns: new[] { "TenantId", "DoctorId", "StartTime" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_TenantId_StartTime",
                table: "Appointments",
                columns: new[] { "TenantId", "StartTime" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Appointments_TenantId_DoctorId_StartTime",
                table: "Appointments");

            migrationBuilder.DropIndex(
                name: "IX_Appointments_TenantId_StartTime",
                table: "Appointments");
        }
    }
}
