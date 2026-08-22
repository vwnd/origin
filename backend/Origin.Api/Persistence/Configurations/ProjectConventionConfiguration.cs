using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Origin.Api.Domain.Entities;

namespace Origin.Api.Persistence.Configurations;

public class ProjectConventionConfiguration : IEntityTypeConfiguration<ProjectConvention>
{
    public void Configure(EntityTypeBuilder<ProjectConvention> builder)
    {
        builder.ToTable("project_conventions");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(x => x.Description)
            .HasMaxLength(2000);

        builder.Property(x => x.IsActive)
            .IsRequired()
            .HasDefaultValue(true);

        builder.Property(x => x.Priority)
            .IsRequired()
            .HasDefaultValue(0);

        // Every list of conventions is read in execution order, scoped to one project.
        builder.HasIndex(x => new { x.ProjectId, x.Priority });

        builder.HasMany(x => x.Versions)
            .WithOne(x => x.ProjectConvention)
            .HasForeignKey(x => x.ProjectConventionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
