namespace Origin.Api.Infrastructure.Speckle;

public record SpeckleProject(string Id, string Name);

/// <summary>
/// A page of Speckle projects. Speckle paginates by cursor, not page number: <paramref name="Cursor"/>
/// is the value to pass back to fetch the next page, and is null once the end has been reached.
/// </summary>
public record SpeckleProjectPage(IReadOnlyList<SpeckleProject> Items, string? Cursor, int TotalCount);
