namespace Origin.Api.Infrastructure.Speckle;

public class SpeckleOptions
{
    public const string SectionName = "Speckle";

    public required string ServerUrl { get; init; }

    /// <summary>Personal access token, supplied via the SPECKLE_TOKEN environment variable.</summary>
    public required string Token { get; init; }
}
