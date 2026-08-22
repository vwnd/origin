using System.Linq.Expressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Origin.Api.Contracts;
using Origin.Api.Domain.Entities;
using Origin.Api.Infrastructure.Blob;
using Origin.Api.Persistence;

namespace Origin.Api.Controllers;

[ApiController]
[Route("api/projects/{projectId:guid}/conventions")]
public class ProjectConventionsController(
    AppDbContext dbContext,
    IBlobStorageService blobStorageService,
    ILogger<ProjectConventionsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ProjectConventionListResponse>> GetAll(
        Guid projectId,
        int page = 1,
        int pageSize = 12,
        CancellationToken cancellationToken = default)
    {
        var projectExists = await dbContext.Projects.AnyAsync(x => x.Id == projectId, cancellationToken);

        if (!projectExists)
        {
            return NotFound();
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = SortedConventions(projectId);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(ToSummary)
            .ToListAsync(cancellationToken);

        return Ok(new ProjectConventionListResponse(items, page, pageSize, totalCount));
    }

    // The ids of the conventions this project actually runs, in execution order.
    [HttpGet("active")]
    public async Task<ActionResult<IReadOnlyList<Guid>>> GetActive(
        Guid projectId,
        CancellationToken cancellationToken)
    {
        var projectExists = await dbContext.Projects.AnyAsync(x => x.Id == projectId, cancellationToken);

        if (!projectExists)
        {
            return NotFound();
        }

        var ids = await SortedConventions(projectId)
            .Where(x => x.IsActive)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);

        return Ok(ids);
    }

    [HttpPost("{conventionId:guid}/toggle")]
    public async Task<ActionResult<ProjectConventionActivationResponse>> Toggle(
        Guid projectId,
        Guid conventionId,
        CancellationToken cancellationToken)
    {
        var convention = await dbContext.ProjectConventions
            .FirstOrDefaultAsync(x => x.Id == conventionId && x.ProjectId == projectId, cancellationToken);

        if (convention is null)
        {
            return NotFound();
        }

        convention.IsActive = !convention.IsActive;
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new ProjectConventionActivationResponse(convention.Id, convention.IsActive));
    }

    // Rewrites the execution order. The request may name every convention on the project
    // or only some of them; a partial list is rearranged among the slots those conventions
    // already hold, leaving everything else where it was. Priorities come out dense from 0
    // either way.
    [HttpPost("re-order")]
    public async Task<ActionResult<ProjectConventionOrderResponse>> Reorder(
        Guid projectId,
        ReorderProjectConventionsRequest request,
        CancellationToken cancellationToken)
    {
        var projectExists = await dbContext.Projects.AnyAsync(x => x.Id == projectId, cancellationToken);

        if (!projectExists)
        {
            return NotFound();
        }

        var requestedIds = (request.ConventionIds ?? []).Distinct().ToList();

        if (requestedIds.Count == 0)
        {
            return BadRequest("A re-order needs at least one convention id.");
        }

        var conventions = await OrderedForWriteAsync(projectId, cancellationToken);
        var byId = conventions.ToDictionary(x => x.Id);

        var unknown = requestedIds.Where(id => !byId.ContainsKey(id)).ToList();

        if (unknown.Count > 0)
        {
            return BadRequest($"These conventions do not belong to this project: {string.Join(", ", unknown)}.");
        }

        var requested = requestedIds.ToHashSet();

        var slots = conventions
            .Select((convention, index) => (convention, index))
            .Where(x => requested.Contains(x.convention.Id))
            .Select(x => x.index)
            .ToList();

        for (var i = 0; i < slots.Count; i++)
        {
            conventions[slots[i]] = byId[requestedIds[i]];
        }

        Renumber(conventions);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new ProjectConventionOrderResponse(conventions.Select(x => x.Id).ToList()));
    }

    [HttpDelete("{conventionId:guid}")]
    public async Task<IActionResult> Delete(
        Guid projectId,
        Guid conventionId,
        CancellationToken cancellationToken)
    {
        var convention = await dbContext.ProjectConventions
            .Include(x => x.Versions)
            .FirstOrDefaultAsync(x => x.Id == conventionId && x.ProjectId == projectId, cancellationToken);

        if (convention is null)
        {
            return NotFound();
        }

        var blobIds = convention.Versions.Select(x => x.BlobId).ToList();

        // Versions go with the convention through the cascade; the markdown behind them
        // has to be cleaned up by hand.
        dbContext.ProjectConventions.Remove(convention);
        await dbContext.SaveChangesAsync(cancellationToken);

        // The rows are gone either way, so a storage hiccup here leaves an orphaned object
        // rather than a half-deleted convention.
        foreach (var blobId in blobIds)
        {
            try
            {
                await blobStorageService.DeleteAsync($"{blobId}.md", cancellationToken);
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "Deleted convention {ConventionId} but could not remove blob {BlobId}.",
                    conventionId,
                    blobId);
            }
        }

        // Deleting from the middle would otherwise leave a hole in the running order.
        var remaining = await OrderedForWriteAsync(projectId, cancellationToken);

        if (Renumber(remaining))
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return NoContent();
    }

    [HttpGet("{conventionId:guid}")]
    public async Task<ActionResult<ProjectConventionDetailResponse>> GetById(
        Guid projectId,
        Guid conventionId,
        CancellationToken cancellationToken)
    {
        var convention = await dbContext.ProjectConventions
            .AsNoTracking()
            .Where(x => x.Id == conventionId && x.ProjectId == projectId)
            .Select(x => new { x.Id, x.Name, x.Description, x.IsActive, x.Priority })
            .FirstOrDefaultAsync(cancellationToken);

        if (convention is null)
        {
            return NotFound();
        }

        var versions = await HistoryAsync(projectId, conventionId, cancellationToken);

        return Ok(new ProjectConventionDetailResponse(
            convention.Id,
            convention.Name,
            convention.Description,
            convention.IsActive,
            convention.Priority,
            versions
                .Select((version, index) => new ProjectConventionVersionSummaryResponse(
                    version.Id,
                    index + 1,
                    version.CreatedAtUtc))
                .Reverse()
                .ToList()));
    }

    [HttpPost("{conventionId:guid}/metadata")]
    public async Task<ActionResult<ProjectConventionMetadataResponse>> UpdateMetadata(
        Guid projectId,
        Guid conventionId,
        UpdateProjectConventionMetadataRequest request,
        CancellationToken cancellationToken)
    {
        var name = request.Name?.Trim();

        if (string.IsNullOrEmpty(name))
        {
            return BadRequest("A convention needs a name.");
        }

        var convention = await dbContext.ProjectConventions
            .FirstOrDefaultAsync(x => x.Id == conventionId && x.ProjectId == projectId, cancellationToken);

        if (convention is null)
        {
            return NotFound();
        }

        convention.Name = name;
        convention.Description = Normalize(request.Description);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new ProjectConventionMetadataResponse(convention.Id, convention.Name, convention.Description));
    }

    [HttpGet("{conventionId:guid}/content")]
    public async Task<ActionResult<ProjectConventionContentResponse>> GetLatestContent(
        Guid projectId,
        Guid conventionId,
        CancellationToken cancellationToken) =>
        await ContentAsync(projectId, conventionId, versionId: null, cancellationToken);

    [HttpGet("{conventionId:guid}/versions/{versionId:guid}/content")]
    public async Task<ActionResult<ProjectConventionContentResponse>> GetVersionContent(
        Guid projectId,
        Guid conventionId,
        Guid versionId,
        CancellationToken cancellationToken) =>
        await ContentAsync(projectId, conventionId, versionId, cancellationToken);

    [HttpPost]
    public async Task<ActionResult<ProjectConventionResponse>> Create(
        Guid projectId,
        CreateProjectConventionRequest request,
        CancellationToken cancellationToken)
    {
        var name = request.Name?.Trim();

        if (string.IsNullOrEmpty(name))
        {
            return BadRequest("A convention needs a name.");
        }

        var projectExists = await dbContext.Projects.AnyAsync(x => x.Id == projectId, cancellationToken);

        if (!projectExists)
        {
            return NotFound();
        }

        // A new convention runs last until someone reorders the project.
        var lastPriority = await dbContext.ProjectConventions
            .Where(x => x.ProjectId == projectId)
            .MaxAsync(x => (int?)x.Priority, cancellationToken);

        var convention = new ProjectConvention
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            Name = name,
            Description = Normalize(request.Description),
            IsActive = true,
            Priority = (lastPriority ?? -1) + 1
        };

        dbContext.ProjectConventions.Add(convention);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(
            nameof(GetById),
            new { projectId, conventionId = convention.Id },
            new ProjectConventionResponse(convention.Id, convention.Name, convention.Description, []));
    }

    [HttpPost("{conventionId:guid}/versions")]
    public async Task<ActionResult<ProjectConventionVersionResponse>> CreateVersion(
        Guid projectId,
        Guid conventionId,
        CreateProjectConventionVersionRequest request,
        CancellationToken cancellationToken)
    {
        var convention = await dbContext.ProjectConventions
            .FirstOrDefaultAsync(x => x.Id == conventionId && x.ProjectId == projectId, cancellationToken);

        if (convention is null)
        {
            return NotFound();
        }

        var version = new ProjectConventionVersion
        {
            Id = Guid.NewGuid(),
            ProjectConventionId = convention.Id,
            BlobId = request.BlobId,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        dbContext.ProjectConventionVersions.Add(version);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new ProjectConventionVersionResponse(version.Id, version.BlobId, version.CreatedAtUtc));
    }

    [HttpGet("{conventionId:guid}/versions/{versionId:guid}/file")]
    public async Task<ActionResult<ProjectConventionVersionFileResponse>> GetVersionFile(
        Guid projectId,
        Guid conventionId,
        Guid versionId,
        CancellationToken cancellationToken)
    {
        var version = await dbContext.ProjectConventionVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == versionId && x.ProjectConventionId == conventionId && x.ProjectConvention.ProjectId == projectId,
                cancellationToken);

        if (version is null)
        {
            return NotFound();
        }

        var url = await blobStorageService.GetPresignedDownloadUrlAsync($"{version.BlobId}.md", cancellationToken);

        return Ok(new ProjectConventionVersionFileResponse(version.Id, url));
    }

    // Both editor pages need the same thing — one revision's markdown, labelled with
    // its place in the history — so they resolve through here. A null versionId means
    // "whatever the latest revision is".
    private async Task<ActionResult<ProjectConventionContentResponse>> ContentAsync(
        Guid projectId,
        Guid conventionId,
        Guid? versionId,
        CancellationToken cancellationToken)
    {
        var name = await dbContext.ProjectConventions
            .AsNoTracking()
            .Where(x => x.Id == conventionId && x.ProjectId == projectId)
            .Select(x => x.Name)
            .FirstOrDefaultAsync(cancellationToken);

        if (name is null)
        {
            return NotFound();
        }

        var versions = await HistoryAsync(projectId, conventionId, cancellationToken);

        var index = versionId is null
            ? versions.Count - 1
            : versions.FindIndex(x => x.Id == versionId);

        if (index < 0)
        {
            return NotFound();
        }

        var version = versions[index];
        var content = await blobStorageService.GetTextAsync($"{version.BlobId}.md", cancellationToken);

        return Ok(new ProjectConventionContentResponse(
            conventionId,
            name,
            version.Id,
            index + 1,
            versions.Count,
            version.CreatedAtUtc,
            content));
    }

    // Oldest first, so a version's index is also its revision number.
    private Task<List<ConventionVersion>> HistoryAsync(
        Guid projectId,
        Guid conventionId,
        CancellationToken cancellationToken) => dbContext.ProjectConventionVersions
        .AsNoTracking()
        .Where(x => x.ProjectConventionId == conventionId && x.ProjectConvention.ProjectId == projectId)
        .OrderBy(x => x.CreatedAtUtc)
        .ThenBy(x => x.Id)
        .Select(x => new ConventionVersion(x.Id, x.BlobId, x.CreatedAtUtc))
        .ToListAsync(cancellationToken);

    private sealed record ConventionVersion(Guid Id, Guid BlobId, DateTimeOffset CreatedAtUtc);

    // The tracked counterpart of SortedConventions, for the actions that rewrite priorities.
    private Task<List<ProjectConvention>> OrderedForWriteAsync(Guid projectId, CancellationToken cancellationToken) =>
        dbContext.ProjectConventions
            .Where(x => x.ProjectId == projectId)
            .OrderBy(x => x.Priority)
            .ThenBy(x => x.Name)
            .ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

    // Priorities are dense from 0 so that a position in the list and a priority are the
    // same number. Returns whether anything moved.
    private static bool Renumber(IReadOnlyList<ProjectConvention> ordered)
    {
        var changed = false;

        for (var i = 0; i < ordered.Count; i++)
        {
            if (ordered[i].Priority == i)
            {
                continue;
            }

            ordered[i].Priority = i;
            changed = true;
        }

        return changed;
    }

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // Execution order. Name and id only break ties between conventions that share a
    // priority, which happens until a project has been reordered once.
    private IOrderedQueryable<ProjectConvention> SortedConventions(Guid projectId) => dbContext.ProjectConventions
        .AsNoTracking()
        .Where(x => x.ProjectId == projectId)
        .OrderBy(x => x.Priority)
        .ThenBy(x => x.Name)
        .ThenBy(x => x.Id);

    private static readonly Expression<Func<ProjectConvention, ProjectConventionSummaryResponse>> ToSummary =
        convention => new ProjectConventionSummaryResponse(
            convention.Id,
            convention.Name,
            convention.Description,
            convention.IsActive,
            convention.Priority,
            convention.Versions
                .OrderByDescending(v => v.CreatedAtUtc)
                .Select(v => (Guid?)v.Id)
                .FirstOrDefault(),
            convention.Versions.Max(v => (DateTimeOffset?)v.CreatedAtUtc),
            convention.Versions.Count);
}
