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

        builder.HasMany(x => x.Versions)
            .WithOne(x => x.ProjectConvention)
            .HasForeignKey(x => x.ProjectConventionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
