using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Origin.Api.Contracts;
using Origin.Api.Domain.Entities;
using Origin.Api.Persistence;

namespace Origin.Api.Controllers;

[ApiController]
[Route("api/projects")]
public class ProjectsController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ProjectListResponse>> GetAll(int page = 1, int pageSize = 12, CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = dbContext.Projects
            .AsNoTracking()
            .OrderBy(x => x.Name);

        var totalCount = await query.CountAsync(cancellationToken);
        var projects = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new ProjectResponse(x.Id, x.Name))
            .ToListAsync(cancellationToken);

        return Ok(new ProjectListResponse(projects, page, pageSize, totalCount));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectDetailResponse>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var project = await dbContext.Projects
            .AsNoTracking()
            .Include(x => x.ProjectConventions)
            .ThenInclude(x => x.Versions)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        return project is null ? NotFound() : Ok(ToDetailResponse(project));
    }

    [HttpPost]
    public async Task<ActionResult<ProjectResponse>> Create(CreateProjectRequest request, CancellationToken cancellationToken)
    {
        var project = new Project
        {
            Id = Guid.NewGuid(),
            Name = request.Name
        };

        dbContext.Projects.Add(project);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = project.Id }, new ProjectResponse(project.Id, project.Name));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectResponse>> Update(Guid id, UpdateProjectRequest request, CancellationToken cancellationToken)
    {
        var project = await dbContext.Projects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (project is null)
        {
            return NotFound();
        }

        project.Name = request.Name;
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new ProjectResponse(project.Id, project.Name));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var project = await dbContext.Projects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (project is null)
        {
            return NotFound();
        }

        dbContext.Projects.Remove(project);
        await dbContext.SaveChangesAsync(cancellationToken);

        return NoContent();
    }

    private static ProjectDetailResponse ToDetailResponse(Project project) => new(
        project.Id,
        project.Name,
        project.ProjectConventions
            // Execution order, the same order the conventions endpoints report.
            .OrderBy(convention => convention.Priority)
            .ThenBy(convention => convention.Name)
            .ThenBy(convention => convention.Id)
            .Select(convention => new ProjectConventionResponse(
                convention.Id,
                convention.Name,
                convention.Description,
                convention.Versions
                    .Select(version => new ProjectConventionVersionResponse(version.Id, version.BlobId, version.CreatedAtUtc))
                    .ToList()))
            .ToList());
}
