using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicSaaS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantTimeZoneId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TimeZoneId",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "Asia/Baghdad");

            migrationBuilder.Sql(
                """
                UPDATE "Tenants" SET "TimeZoneId" = 'Asia/Damascus'
                WHERE "Id" = '11111111-1111-1111-1111-111111111111';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TimeZoneId",
                table: "Tenants");
        }
    }
}
