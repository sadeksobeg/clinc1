using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEnterpriseBillingAndUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AddonRevenueUsd",
                table: "Tenants",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "AnnualDiscountPercent",
                table: "Tenants",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "IncludedAppointmentsPerMonth",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "IncludedConversationsPerMonth",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "IncludedDoctorSeats",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlyPriceUsd",
                table: "Tenants",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "SubscriptionActivatedAtUtc",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionChannel",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionCycle",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "SubscriptionExpiresAtUtc",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionStatus",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "SubscriptionAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubscriptionRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    Action = table.Column<string>(type: "text", nullable: false),
                    Details = table.Column<string>(type: "text", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionAuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicName = table.Column<string>(type: "text", nullable: false),
                    RequestedByDoctorName = table.Column<string>(type: "text", nullable: false),
                    RequestedByDoctorEmail = table.Column<string>(type: "text", nullable: false),
                    RequestedByPhone = table.Column<string>(type: "text", nullable: false),
                    Channel = table.Column<string>(type: "text", nullable: false),
                    Cycle = table.Column<string>(type: "text", nullable: false),
                    MonthlyPriceUsd = table.Column<decimal>(type: "numeric", nullable: false),
                    AnnualDiscountPercent = table.Column<decimal>(type: "numeric", nullable: false),
                    FinalPriceUsd = table.Column<decimal>(type: "numeric", nullable: false),
                    PaymentReference = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    DecisionReason = table.Column<string>(type: "text", nullable: true),
                    ReviewedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReviewedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionRequests", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionAuditLogs_TenantId_CreatedAtUtc",
                table: "SubscriptionAuditLogs",
                columns: new[] { "TenantId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionRequests_TenantId_Status_CreatedAtUtc",
                table: "SubscriptionRequests",
                columns: new[] { "TenantId", "Status", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SubscriptionAuditLogs");

            migrationBuilder.DropTable(
                name: "SubscriptionRequests");

            migrationBuilder.DropColumn(
                name: "AddonRevenueUsd",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "AnnualDiscountPercent",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "IncludedAppointmentsPerMonth",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "IncludedConversationsPerMonth",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "IncludedDoctorSeats",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "MonthlyPriceUsd",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionActivatedAtUtc",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionChannel",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionCycle",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionExpiresAtUtc",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionStatus",
                table: "Tenants");
        }
    }
}
