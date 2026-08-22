namespace Origin.Api.Contracts;

public record CreateProjectConventionRequest(string Name, string? Description);

public record UpdateProjectConventionMetadataRequest(string Name, string? Description);

public record CreateProjectConventionVersionRequest(Guid BlobId);

public record ProjectConventionVersionFileResponse(Guid VersionId, string Url);

public record ProjectConventionSummaryResponse(
    Guid Id,
    string Name,
    string? Description,
    bool IsActive,
    int Priority,
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
    bool IsActive,
    int Priority,
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

// The toggle answers with the state it landed on, so a switch that fired against a
// stale view corrects itself instead of drifting.
public record ProjectConventionActivationResponse(Guid Id, bool IsActive);

// Convention ids in the order they should run. A partial list is allowed: the listed
// conventions are rearranged among the execution slots they already occupy, which is
// what a drag within one page of a paginated list means.
public record ReorderProjectConventionsRequest(IReadOnlyList<Guid> ConventionIds);

// Every convention on the project, in execution order, so a reorder settles the caller's
// view even when it only sent part of the list.
public record ProjectConventionOrderResponse(IReadOnlyList<Guid> ConventionIds);
