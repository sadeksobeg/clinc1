using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddWebhookSecretAndQueueNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "WhatsAppWebhookSecret",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateOnly>(
                name: "QueueDate",
                table: "Appointments",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<int>(
                name: "QueueNumber",
                table: "Appointments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(@"
UPDATE ""Tenants""
SET ""WhatsAppWebhookSecret"" = 'dev-acme-secret'
WHERE ""Id"" = '11111111-1111-1111-1111-111111111111'
  AND (""WhatsAppWebhookSecret"" IS NULL OR ""WhatsAppWebhookSecret"" = '');
");

            migrationBuilder.Sql(@"
WITH q AS (
  SELECT
    ""Id"",
    CAST(""StartTime"" AT TIME ZONE 'UTC' AS date) AS qdate,
    ROW_NUMBER() OVER (
      PARTITION BY ""TenantId"", ""DoctorId"", CAST(""StartTime"" AT TIME ZONE 'UTC' AS date)
      ORDER BY ""StartTime"", ""Id""
    ) AS qnum
  FROM ""Appointments""
)
UPDATE ""Appointments"" a
SET
  ""QueueDate"" = q.qdate,
  ""QueueNumber"" = q.qnum
FROM q
WHERE a.""Id"" = q.""Id"";
");

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_TenantId_DoctorId_QueueDate_QueueNumber",
                table: "Appointments",
                columns: new[] { "TenantId", "DoctorId", "QueueDate", "QueueNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Appointments_TenantId_DoctorId_QueueDate_QueueNumber",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "WhatsAppWebhookSecret",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "QueueDate",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "QueueNumber",
                table: "Appointments");
        }
    }
}
