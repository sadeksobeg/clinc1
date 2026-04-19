using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTierCatalogAndAddons : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "OverageRevenueUsd",
                table: "Tenants",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "PlanTier",
                table: "SubscriptionRequests",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "RequestedAddonsJson",
                table: "SubscriptionRequests",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "AddonCatalogItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    UnitType = table.Column<string>(type: "text", nullable: false),
                    UnitPriceUsd = table.Column<decimal>(type: "numeric", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AddonCatalogItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TenantAddonSubscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddonCatalogItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    UnitPriceUsd = table.Column<decimal>(type: "numeric", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantAddonSubscriptions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AddonCatalogItems_Code",
                table: "AddonCatalogItems",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantAddonSubscriptions_TenantId_AddonCatalogItemId",
                table: "TenantAddonSubscriptions",
                columns: new[] { "TenantId", "AddonCatalogItemId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AddonCatalogItems");

            migrationBuilder.DropTable(
                name: "TenantAddonSubscriptions");

            migrationBuilder.DropColumn(
                name: "OverageRevenueUsd",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "PlanTier",
                table: "SubscriptionRequests");

            migrationBuilder.DropColumn(
                name: "RequestedAddonsJson",
                table: "SubscriptionRequests");
        }
    }
}
