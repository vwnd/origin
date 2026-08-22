namespace Origin.Api.Infrastructure.Speckle;

/// <summary>
/// Wraps any failure talking to Speckle so callers have a single exception type to handle.
/// The SDK surfaces GraphQL errors as an <see cref="AggregateException"/> around its own
/// exception types, which is awkward to catch at the API boundary.
/// </summary>
public class SpeckleIntegrationException(string message, Exception innerException)
    : Exception(message, innerException);
