using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Origin.Api.Domain.Entities;

namespace Origin.Api.Persistence.Configurations;

public class ProjectConventionVersionConfiguration : IEntityTypeConfiguration<ProjectConventionVersion>
{
    public void Configure(EntityTypeBuilder<ProjectConventionVersion> builder)
    {
        builder.ToTable("project_convention_versions");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.BlobId)
            .HasColumnName("blob_id")
            .IsRequired();

        builder.Property(x => x.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();
    }
}
