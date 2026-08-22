namespace Origin.Api.Domain.Entities;

public class ProjectConvention
{
    public Guid Id { get; set; }

    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public List<ProjectConventionVersion> Versions { get; set; } = [];
}
