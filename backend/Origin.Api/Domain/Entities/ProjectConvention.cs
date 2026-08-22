namespace Origin.Api.Domain.Entities;

public class ProjectConvention
{
    public Guid Id { get; set; }

    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    // Whether the project runs this convention. Conventions stay in the list when
    // switched off, so turning one back on keeps its place in the running order.
    public bool IsActive { get; set; } = true;

    // The execution order within the project, ascending, dense from 0. Priorities are
    // only meaningful relative to the other conventions on the same project.
    public int Priority { get; set; }

    public List<ProjectConventionVersion> Versions { get; set; } = [];
}
