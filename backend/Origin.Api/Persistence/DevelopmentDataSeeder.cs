using System.Reflection;
using System.Text.RegularExpressions;
using Bogus;
using Microsoft.EntityFrameworkCore;
using Origin.Api.Domain.Entities;
using Origin.Api.Infrastructure.Blob;

namespace Origin.Api.Persistence;

public partial class DevelopmentDataSeeder(AppDbContext dbContext, IBlobStorageService blobStorageService)
{
    // Famous buildings stand in for real projects; the list length is the project count.
    private static readonly string[] ProjectNames =
    [
        "Burj Khalifa",
        "Sagrada Familia",
        "Sydney Opera House",
        "Taj Mahal",
        "Empire State Building",
        "Guggenheim Museum Bilbao",
        "Marina Bay Sands",
        "The Shard"
    ];

    // Set in Origin.Api.csproj, which embeds fleet/tasks/*.md under this prefix.
    private const string TaskResourcePrefix = "FleetTasks.";

    private static readonly Lazy<IReadOnlyList<TaskDocument>> Tasks = new(LoadTaskDocuments);

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (await dbContext.ProjectConventions.AnyAsync(cancellationToken))
        {
            return;
        }

        var faker = new Faker { Random = new Randomizer(20260822) };
        var createdAt = DateTimeOffset.UtcNow;

        for (var projectIndex = 0; projectIndex < ProjectNames.Length; projectIndex++)
        {
            var project = new Project
            {
                Id = Guid.NewGuid(),
                Name = ProjectNames[projectIndex]
            };

            dbContext.Projects.Add(project);

            // A convention is one fleet task adopted by one project. The first project
            // adopts the whole task library; the rest adopt an assortment of it.
            var adopted = projectIndex == 0
                ? Tasks.Value
                : faker.Random.Shuffle(Tasks.Value)
                    .Take(faker.Random.Int(2, Tasks.Value.Count))
                    .ToList();

            var conventionIndex = 0;

            foreach (var task in adopted)
            {
                var convention = new ProjectConvention
                {
                    Id = Guid.NewGuid(),
                    ProjectId = project.Id,
                    Name = task.Title,
                    Description = task.Summary,
                    // Adoption order is the running order, and most conventions are switched
                    // on — a few are not, so the list has something to show off.
                    Priority = conventionIndex,
                    IsActive = faker.Random.Double() > 0.25
                };

                dbContext.ProjectConventions.Add(convention);

                var revisionCount = faker.Random.Int(1, 4);

                for (var revision = 1; revision <= revisionCount; revision++)
                {
                    var blobId = Guid.NewGuid();

                    dbContext.ProjectConventionVersions.Add(new ProjectConventionVersion
                    {
                        Id = Guid.NewGuid(),
                        ProjectConventionId = convention.Id,
                        BlobId = blobId,
                        CreatedAtUtc = createdAt.AddHours(-((conventionIndex * 24) + (revisionCount - revision)))
                    });

                    await blobStorageService.UploadTextAsync(
                        $"{blobId}.md",
                        BuildMarkdown(project.Name, task, revision, revisionCount),
                        cancellationToken);
                }

                conventionIndex++;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string BuildMarkdown(string projectName, TaskDocument task, int revision, int revisionCount) =>
        $"""
         # {task.Title}

         Revision {revision} of {revisionCount}, as adopted by {projectName}.

         ---

         {task.Markdown.TrimEnd()}
         """;

    private static IReadOnlyList<TaskDocument> LoadTaskDocuments()
    {
        var assembly = Assembly.GetExecutingAssembly();

        var documents = assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(TaskResourcePrefix, StringComparison.Ordinal))
            .OrderBy(name => name, StringComparer.Ordinal)
            .Select(name =>
            {
                using var stream = assembly.GetManifestResourceStream(name)!;
                using var reader = new StreamReader(stream);

                return TaskDocument.Parse(reader.ReadToEnd());
            })
            .ToList();

        return documents.Count > 0
            ? documents
            : throw new InvalidOperationException(
                $"No task briefs embedded under '{TaskResourcePrefix}'. Check the EmbeddedResource glob in Origin.Api.csproj.");
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    private sealed record TaskDocument(string Title, string? Summary, string Markdown)
    {
        public static TaskDocument Parse(string markdown)
        {
            markdown = markdown.Replace("\r\n", "\n");

            var lines = markdown.Split('\n');

            var heading = lines
                .Select(line => line.Trim())
                .FirstOrDefault(line => line.StartsWith("# ", StringComparison.Ordinal));

            var title = heading?["# ".Length..] ?? "Untitled task";

            // Task briefs title themselves "# Task: Duplicate Doors"; the prefix is noise
            // in a list that already says these are tasks.
            if (title.StartsWith("Task: ", StringComparison.Ordinal))
            {
                title = title["Task: ".Length..];
            }

            return new TaskDocument(title, ParseSummary(lines), markdown);
        }

        // The first sentence of the brief's Objective doubles as the convention description.
        private static string? ParseSummary(IReadOnlyList<string> lines)
        {
            var objective = lines
                .SkipWhile(line => !line.Trim().Equals("## Objective", StringComparison.OrdinalIgnoreCase))
                .Skip(1)
                .TakeWhile(line => !line.TrimStart().StartsWith('#') && !string.IsNullOrWhiteSpace(line));

            var paragraph = Whitespace().Replace(string.Join(' ', objective), " ").Trim();

            if (paragraph.Length == 0)
            {
                return null;
            }

            var sentenceEnd = paragraph.IndexOf(". ", StringComparison.Ordinal);

            return sentenceEnd < 0 ? paragraph : paragraph[..(sentenceEnd + 1)];
        }
    }
}
