using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PlatformAdminDoctorLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RecordedAt",
                table: "DoctorStatuses",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "LinkedUserId",
                table: "Doctors",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE "DoctorStatuses" SET "RecordedAt" = NOW();
                ALTER TABLE "DoctorStatuses" ALTER COLUMN "RecordedAt" SET DEFAULT (NOW());
                """);

            const string passwordHash =
                "120000.AQIDBAUGBwgJCgsMDQ4PEA==.zFCKjj8qmbXKUDAmjH+7m1VQ/n9MHK2w2Slw5hzzwe4=";
            var acmeTenantId = "11111111-1111-1111-1111-111111111111";
            var platformUserId = "55555555-5555-5555-5555-555555555555";
            var doctorUserId = "44444444-4444-4444-4444-444444444444";
            var doctorId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
            var betaTenantId = "66666666-6666-6666-6666-666666666666";

            migrationBuilder.Sql($"""
                INSERT INTO "Tenants" ("Id", "Name", "SubscriptionPlan", "CreatedAt", "TimeZoneId")
                VALUES ('{betaTenantId}', 'Beta Clinic', 'Basic', NOW(), 'Asia/Baghdad')
                ON CONFLICT ("Id") DO NOTHING;
                """);

            migrationBuilder.Sql($"""
                INSERT INTO "Users" ("Id", "Name", "Email", "PasswordHash", "Role", "TenantId")
                VALUES ('{platformUserId}', 'Platform Admin', 'platform@acme.dev', '{passwordHash}', 3, '{acmeTenantId}')
                ON CONFLICT ("Id") DO NOTHING;
                """);

            migrationBuilder.Sql($"""
                UPDATE "Doctors" SET "LinkedUserId" = '{doctorUserId}' WHERE "Id" = '{doctorId}';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DELETE FROM "Users" WHERE "Id" = '55555555-5555-5555-5555-555555555555';
                UPDATE "Doctors" SET "LinkedUserId" = NULL WHERE "Id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
                DELETE FROM "Tenants" WHERE "Id" = '66666666-6666-6666-6666-666666666666';
                """);

            migrationBuilder.DropColumn(
                name: "RecordedAt",
                table: "DoctorStatuses");

            migrationBuilder.DropColumn(
                name: "LinkedUserId",
                table: "Doctors");
        }
    }
}
