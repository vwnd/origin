namespace Origin.Api.Domain.Entities;

public class Project
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public List<ProjectConvention> ProjectConventions { get; set; } = [];
}
