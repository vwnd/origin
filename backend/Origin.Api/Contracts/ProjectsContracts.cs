namespace Origin.Api.Contracts;

public record ProjectResponse(Guid Id, string Name);

public record ProjectListResponse(IReadOnlyList<ProjectResponse> Items, int Page, int PageSize, int TotalCount);

public record ProjectDetailResponse(Guid Id, string Name, IReadOnlyList<ProjectConventionResponse> Conventions);

public record ProjectConventionResponse(
    Guid Id,
    string Name,
    string? Description,
    IReadOnlyList<ProjectConventionVersionResponse> Versions);

public record ProjectConventionVersionResponse(Guid Id, Guid BlobId, DateTimeOffset CreatedAtUtc);

public record CreateProjectRequest(string Name);

public record UpdateProjectRequest(string Name);
