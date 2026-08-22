using Speckle.Sdk;
using Speckle.Sdk.Api;
using Speckle.Sdk.Api.GraphQL.Inputs;

namespace Origin.Api.Infrastructure.Speckle;

public class SpeckleProjectClient(IClientFactory clientFactory, SpeckleAccountProvider accountProvider)
    : ISpeckleProjectClient
{
    public async Task<SpeckleProjectPage> GetProjectsAsync(
        int limit,
        string? cursor = null,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var account = await accountProvider.GetAccountAsync(cancellationToken);

            using var client = clientFactory.Create(account);

            var filter = string.IsNullOrWhiteSpace(search) ? null : new UserProjectsFilter(search);
            var projects = await client.ActiveUser.GetProjects(limit, cursor, filter, cancellationToken);

            return new SpeckleProjectPage(
                projects.items.Select(project => new SpeckleProject(project.id, project.name)).ToList(),
                projects.cursor,
                projects.totalCount);
        }
        catch (Exception exception) when (exception is SpeckleException or AggregateException or HttpRequestException)
        {
            throw new SpeckleIntegrationException(exception.GetBaseException().Message, exception);
        }
    }
}
