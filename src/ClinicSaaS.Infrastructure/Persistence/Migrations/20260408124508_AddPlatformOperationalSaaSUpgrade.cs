using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformOperationalSaaSUpgrade : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByPlatformAdminId",
                table: "Users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FullName",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsDisabled",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsOnline",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastSeenAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LinkedToDoctorId",
                table: "Users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ActivatedAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "LastActivityAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PlatformAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "text", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    EntityType = table.Column<string>(type: "text", nullable: false),
                    EntityId = table.Column<string>(type: "text", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformAuditLogs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_TenantId_LastSeenAt",
                table: "Users",
                columns: new[] { "TenantId", "LastSeenAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Users_TenantId_Role_IsDisabled",
                table: "Users",
                columns: new[] { "TenantId", "Role", "IsDisabled" });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformAuditLogs_ActorUserId",
                table: "PlatformAuditLogs",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformAuditLogs_Timestamp",
                table: "PlatformAuditLogs",
                column: "Timestamp");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformAuditLogs");

            migrationBuilder.DropIndex(
                name: "IX_Users_TenantId_LastSeenAt",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_TenantId_Role_IsDisabled",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CreatedByPlatformAdminId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "FullName",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsDisabled",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsOnline",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LastSeenAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LinkedToDoctorId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ActivatedAt",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "LastActivityAt",
                table: "Tenants");
        }
    }
}
