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
public class ProjectConventionsController(AppDbContext dbContext, IBlobStorageService blobStorageService) : ControllerBase
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

    [HttpGet("latest")]
    public async Task<ActionResult<ProjectConventionSummaryResponse>> GetLatest(Guid projectId, CancellationToken cancellationToken)
    {
        var latest = await SortedConventions(projectId)
            .Select(ToSummary)
            .FirstOrDefaultAsync(cancellationToken);

        return latest is null ? NotFound() : Ok(latest);
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
            .Select(x => new { x.Id, x.Name, x.Description })
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

        var convention = new ProjectConvention
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            Name = name,
            Description = Normalize(request.Description)
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

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private IOrderedQueryable<ProjectConvention> SortedConventions(Guid projectId) => dbContext.ProjectConventions
        .AsNoTracking()
        .Where(x => x.ProjectId == projectId)
        .OrderBy(x => x.Name)
        .ThenBy(x => x.Id);

    private static readonly Expression<Func<ProjectConvention, ProjectConventionSummaryResponse>> ToSummary =
        convention => new ProjectConventionSummaryResponse(
            convention.Id,
            convention.Name,
            convention.Description,
            convention.Versions
                .OrderByDescending(v => v.CreatedAtUtc)
                .Select(v => (Guid?)v.Id)
                .FirstOrDefault(),
            convention.Versions.Max(v => (DateTimeOffset?)v.CreatedAtUtc),
            convention.Versions.Count);
}
