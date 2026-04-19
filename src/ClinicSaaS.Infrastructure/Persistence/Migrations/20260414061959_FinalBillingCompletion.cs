using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class FinalBillingCompletion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DecisionReason",
                table: "Payments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "EvidenceUrl",
                table: "Payments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<long>(
                name: "InvoiceSequence",
                table: "Invoices",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "PaymentDecisionReason",
                table: "Invoices",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TaxId",
                table: "Invoices",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "LedgerAccounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    IsSystem = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LedgerAccounts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LedgerEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    EntryType = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    ReferenceType = table.Column<string>(type: "text", nullable: false),
                    ReferenceId = table.Column<string>(type: "text", nullable: false),
                    PostedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LedgerEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PredictionOutcomes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PredictionId = table.Column<string>(type: "text", nullable: false),
                    ActualOutcome = table.Column<string>(type: "text", nullable: false),
                    Correct = table.Column<bool>(type: "boolean", nullable: false),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PredictionOutcomes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LedgerAccounts_TenantId_Code",
                table: "LedgerAccounts",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LedgerEntries_TenantId_ReferenceType_ReferenceId",
                table: "LedgerEntries",
                columns: new[] { "TenantId", "ReferenceType", "ReferenceId" });

            migrationBuilder.CreateIndex(
                name: "IX_PredictionOutcomes_TenantId_PredictionId_RecordedAtUtc",
                table: "PredictionOutcomes",
                columns: new[] { "TenantId", "PredictionId", "RecordedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LedgerAccounts");

            migrationBuilder.DropTable(
                name: "LedgerEntries");

            migrationBuilder.DropTable(
                name: "PredictionOutcomes");

            migrationBuilder.DropColumn(
                name: "DecisionReason",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "EvidenceUrl",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "InvoiceSequence",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "PaymentDecisionReason",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "TaxId",
                table: "Invoices");
        }
    }
}
