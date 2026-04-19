using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRevenueAnalyticsSprintEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CommunicationCampaigns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Channel = table.Column<string>(type: "text", nullable: false),
                    TemplateCode = table.Column<string>(type: "text", nullable: false),
                    TargetSegment = table.Column<string>(type: "text", nullable: false),
                    ScheduledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false),
                    EstimatedRecipients = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommunicationCampaigns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CommunicationConversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Channel = table.Column<string>(type: "text", nullable: false),
                    ContactName = table.Column<string>(type: "text", nullable: false),
                    ContactPhone = table.Column<string>(type: "text", nullable: false),
                    Direction = table.Column<string>(type: "text", nullable: false),
                    MessagePreview = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommunicationConversations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CommunicationTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Channel = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommunicationTemplates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OnboardingChecklistStates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddedDoctor = table.Column<bool>(type: "boolean", nullable: false),
                    AddedVisitType = table.Column<bool>(type: "boolean", nullable: false),
                    ConnectedWhatsApp = table.Column<bool>(type: "boolean", nullable: false),
                    CompletedFirstBooking = table.Column<bool>(type: "boolean", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OnboardingChecklistStates", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CommunicationCampaigns_TenantId_Status_CreatedAtUtc",
                table: "CommunicationCampaigns",
                columns: new[] { "TenantId", "Status", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CommunicationConversations_TenantId_Channel_UpdatedAtUtc",
                table: "CommunicationConversations",
                columns: new[] { "TenantId", "Channel", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CommunicationTemplates_TenantId_Code",
                table: "CommunicationTemplates",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OnboardingChecklistStates_TenantId",
                table: "OnboardingChecklistStates",
                column: "TenantId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CommunicationCampaigns");

            migrationBuilder.DropTable(
                name: "CommunicationConversations");

            migrationBuilder.DropTable(
                name: "CommunicationTemplates");

            migrationBuilder.DropTable(
                name: "OnboardingChecklistStates");
        }
    }
}
