using Microsoft.AspNetCore.Mvc;
using Origin.Api.Contracts;
using Origin.Api.Infrastructure.Speckle;

namespace Origin.Api.Controllers;

[ApiController]
[Route("api/speckle/projects")]
public class SpeckleProjectsController(
    ISpeckleProjectClient speckleProjectClient,
    ILogger<SpeckleProjectsController> logger) : ControllerBase
{
    /// <summary>
    /// Returns the Speckle projects the configured token can see, shaped as select-menu options.
    /// Paginate by passing the <c>cursor</c> from the previous response.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<SpeckleProjectOptionListResponse>> GetOptions(
        int limit = 25,
        string? cursor = null,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 100);

        try
        {
            var page = await speckleProjectClient.GetProjectsAsync(limit, cursor, search, cancellationToken);

            return Ok(new SpeckleProjectOptionListResponse(
                page.Items.Select(project => new SpeckleProjectOptionResponse(project.Id, project.Name)).ToList(),
                page.Cursor,
                page.TotalCount));
        }
        catch (SpeckleIntegrationException exception)
        {
            logger.LogError(exception, "Failed to fetch projects from Speckle.");

            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails
            {
                Title = "Speckle request failed",
                Detail = exception.Message,
                Status = StatusCodes.Status502BadGateway
            });
        }
    }
}
