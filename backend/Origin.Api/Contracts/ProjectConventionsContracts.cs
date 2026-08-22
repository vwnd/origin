namespace Origin.Api.Contracts;

public record CreateProjectConventionRequest(string Name, string? Description);

public record UpdateProjectConventionMetadataRequest(string Name, string? Description);

public record CreateProjectConventionVersionRequest(Guid BlobId);

public record ProjectConventionVersionFileResponse(Guid VersionId, string Url);

public record ProjectConventionSummaryResponse(
    Guid Id,
    string Name,
    string? Description,
    Guid? LatestVersionId,
    DateTimeOffset? LatestVersionCreatedAtUtc,
    int VersionCount);

public record ProjectConventionListResponse(
    IReadOnlyList<ProjectConventionSummaryResponse> Items,
    int Page,
    int PageSize,
    int TotalCount);

public record ProjectConventionMetadataResponse(Guid Id, string Name, string? Description);

// Number is the 1-based position in the convention's history, oldest first, so the
// UI can say "version 3 of 4" without re-deriving the order.
public record ProjectConventionVersionSummaryResponse(Guid Id, int Number, DateTimeOffset CreatedAtUtc);

public record ProjectConventionDetailResponse(
    Guid Id,
    string Name,
    string? Description,
    IReadOnlyList<ProjectConventionVersionSummaryResponse> Versions);

// The editor pages render a single revision and label it, so the content response
// carries enough context to stand on its own.
public record ProjectConventionContentResponse(
    Guid ConventionId,
    string ConventionName,
    Guid VersionId,
    int VersionNumber,
    int VersionCount,
    DateTimeOffset CreatedAtUtc,
    string Content);
