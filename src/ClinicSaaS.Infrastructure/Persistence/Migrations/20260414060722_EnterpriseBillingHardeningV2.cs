using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EnterpriseBillingHardeningV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "GraceEndsAt",
                table: "Subscriptions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PlanVersionId",
                table: "Subscriptions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowOverage",
                table: "Plans",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "IncludedUnits",
                table: "Plans",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "OveragePricePerUnit",
                table: "Plans",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Amount",
                table: "Payments",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Payments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "Discount",
                table: "Invoices",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Subtotal",
                table: "Invoices",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Tax",
                table: "Invoices",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "ClosedAt",
                table: "BillingPeriods",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsFinalized",
                table: "BillingPeriods",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "BillingAdjustments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubscriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    ApprovedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    ApprovedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAdjustments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BillingAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    EntityType = table.Column<string>(type: "text", nullable: false),
                    EntityId = table.Column<string>(type: "text", nullable: false),
                    Action = table.Column<string>(type: "text", nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PaymentAttempts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    AttemptedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    FailureReason = table.Column<string>(type: "text", nullable: false),
                    GatewayResponse = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentAttempts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PaymentVerifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reference = table.Column<string>(type: "text", nullable: false),
                    VerifiedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentVerifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlanVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    PriceMonthly = table.Column<decimal>(type: "numeric", nullable: false),
                    PriceYearly = table.Column<decimal>(type: "numeric", nullable: true),
                    MaxDoctors = table.Column<int>(type: "integer", nullable: false),
                    MaxReceptionists = table.Column<int>(type: "integer", nullable: false),
                    MaxAppointmentsPerMonth = table.Column<int>(type: "integer", nullable: false),
                    MaxMessages = table.Column<int>(type: "integer", nullable: false),
                    EffectiveFrom = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanVersions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionContracts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubscriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    MonthlyPriceOverride = table.Column<decimal>(type: "numeric", nullable: true),
                    DiscountPercent = table.Column<decimal>(type: "numeric", nullable: true),
                    MaxDoctorsOverride = table.Column<int>(type: "integer", nullable: true),
                    MaxReceptionistsOverride = table.Column<int>(type: "integer", nullable: true),
                    MaxAppointmentsOverride = table.Column<int>(type: "integer", nullable: true),
                    MaxMessagesOverride = table.Column<int>(type: "integer", nullable: true),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionContracts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Wallets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Balance = table.Column<decimal>(type: "numeric", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Wallets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WalletTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WalletId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalletTransactions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAdjustments_SubscriptionId_ApprovedAt",
                table: "BillingAdjustments",
                columns: new[] { "SubscriptionId", "ApprovedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAuditLogs_TenantId_CreatedAtUtc",
                table: "BillingAuditLogs",
                columns: new[] { "TenantId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAttempts_PaymentId_AttemptedAt",
                table: "PaymentAttempts",
                columns: new[] { "PaymentId", "AttemptedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentVerifications_PaymentId",
                table: "PaymentVerifications",
                column: "PaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlanVersions_PlanId_Version",
                table: "PlanVersions",
                columns: new[] { "PlanId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionContracts_SubscriptionId",
                table: "SubscriptionContracts",
                column: "SubscriptionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Wallets_TenantId",
                table: "Wallets",
                column: "TenantId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WalletTransactions_WalletId_CreatedAtUtc",
                table: "WalletTransactions",
                columns: new[] { "WalletId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillingAdjustments");

            migrationBuilder.DropTable(
                name: "BillingAuditLogs");

            migrationBuilder.DropTable(
                name: "PaymentAttempts");

            migrationBuilder.DropTable(
                name: "PaymentVerifications");

            migrationBuilder.DropTable(
                name: "PlanVersions");

            migrationBuilder.DropTable(
                name: "SubscriptionContracts");

            migrationBuilder.DropTable(
                name: "Wallets");

            migrationBuilder.DropTable(
                name: "WalletTransactions");

            migrationBuilder.DropColumn(
                name: "GraceEndsAt",
                table: "Subscriptions");

            migrationBuilder.DropColumn(
                name: "PlanVersionId",
                table: "Subscriptions");

            migrationBuilder.DropColumn(
                name: "AllowOverage",
                table: "Plans");

            migrationBuilder.DropColumn(
                name: "IncludedUnits",
                table: "Plans");

            migrationBuilder.DropColumn(
                name: "OveragePricePerUnit",
                table: "Plans");

            migrationBuilder.DropColumn(
                name: "Amount",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "Discount",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "Subtotal",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "Tax",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "ClosedAt",
                table: "BillingPeriods");

            migrationBuilder.DropColumn(
                name: "IsFinalized",
                table: "BillingPeriods");
        }
    }
}
