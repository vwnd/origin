namespace Origin.Api.Infrastructure.Speckle;

public interface ISpeckleProjectClient
{
    /// <param name="limit">Max number of projects to fetch.</param>
    /// <param name="cursor">Cursor from a previous page, or null for the first page.</param>
    /// <param name="search">Optional server-side name filter.</param>
    Task<SpeckleProjectPage> GetProjectsAsync(
        int limit,
        string? cursor = null,
        string? search = null,
        CancellationToken cancellationToken = default);
}
