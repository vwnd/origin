using Microsoft.EntityFrameworkCore;
using Origin.Api.Domain.Entities;

namespace Origin.Api.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    public DbSet<ProjectConvention> ProjectConventions => Set<ProjectConvention>();

    public DbSet<ProjectConventionVersion> ProjectConventionVersions => Set<ProjectConventionVersion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
