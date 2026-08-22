namespace Origin.Api.Domain.Entities;

public class ProjectConventionVersion
{
    public Guid Id { get; set; }

    public Guid ProjectConventionId { get; set; }

    public ProjectConvention ProjectConvention { get; set; } = null!;

    public Guid BlobId { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }
}
