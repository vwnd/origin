using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Origin.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectConventionActivationAndPriority : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_project_conventions_ProjectId",
                table: "project_conventions");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "project_conventions",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "Priority",
                table: "project_conventions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Without this every existing convention would sit at priority 0 and the running
            // order would fall through to the name tiebreak. Seed the order it already
            // reads in, densely, so the first re-order has something to rearrange.
            migrationBuilder.Sql("""
                UPDATE project_conventions AS c
                SET "Priority" = ordered.position
                FROM (
                    SELECT
                        "Id",
                        ROW_NUMBER() OVER (PARTITION BY "ProjectId" ORDER BY "Name", "Id") - 1 AS position
                    FROM project_conventions
                ) AS ordered
                WHERE c."Id" = ordered."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_project_conventions_ProjectId_Priority",
                table: "project_conventions",
                columns: new[] { "ProjectId", "Priority" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_project_conventions_ProjectId_Priority",
                table: "project_conventions");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "project_conventions");

            migrationBuilder.DropColumn(
                name: "Priority",
                table: "project_conventions");

            migrationBuilder.CreateIndex(
                name: "IX_project_conventions_ProjectId",
                table: "project_conventions",
                column: "ProjectId");
        }
    }
}
