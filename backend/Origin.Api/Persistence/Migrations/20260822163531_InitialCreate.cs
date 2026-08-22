using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Origin.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "projects",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_projects", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "project_conventions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_conventions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_project_conventions_projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "project_convention_versions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectConventionId = table.Column<Guid>(type: "uuid", nullable: false),
                    blob_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_convention_versions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_project_convention_versions_project_conventions_ProjectConv~",
                        column: x => x.ProjectConventionId,
                        principalTable: "project_conventions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_project_convention_versions_ProjectConventionId",
                table: "project_convention_versions",
                column: "ProjectConventionId");

            migrationBuilder.CreateIndex(
                name: "IX_project_conventions_ProjectId",
                table: "project_conventions",
                column: "ProjectId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_convention_versions");

            migrationBuilder.DropTable(
                name: "project_conventions");

            migrationBuilder.DropTable(
                name: "projects");
        }
    }
}
