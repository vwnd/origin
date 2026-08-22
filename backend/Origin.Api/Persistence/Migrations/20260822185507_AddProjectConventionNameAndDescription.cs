using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Origin.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectConventionNameAndDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "project_conventions",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "project_conventions",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "project_conventions");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "project_conventions");
        }
    }
}
