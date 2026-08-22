namespace Origin.Api.Contracts;

/// <summary>
/// A Speckle project shaped as a select-menu option: <c>Label</c> is the project name and is what
/// gets rendered, <c>Value</c> is the Speckle project id and is what gets selected.
/// </summary>
public record SpeckleProjectOptionResponse(string Value, string Label);

/// <summary>
/// Speckle paginates by cursor. <c>Cursor</c> is the value to send back as <c>?cursor=</c> to load
/// the next page, and is null once every project has been returned.
/// </summary>
public record SpeckleProjectOptionListResponse(
    IReadOnlyList<SpeckleProjectOptionResponse> Items,
    string? Cursor,
    int TotalCount);
