namespace Origin.Api.Infrastructure.Configuration;

/// <summary>
/// Minimal .env reader. Secrets such as the Speckle token live in a gitignored .env at the
/// repository root so the API and the frontend can share one file, but the .NET configuration
/// system only reads real environment variables, so the file is promoted into them at startup.
/// </summary>
/// <remarks>
/// The built-in INI provider looks like a fit for KEY=value files, but PhysicalFileProvider
/// excludes dot-prefixed files by default, so it silently reads nothing from a .env.
/// </remarks>
public static class DotEnvFile
{
    private const int MaxSearchDepth = 8;

    public static void Load(string fileName = ".env")
    {
        var path = Find(fileName);

        if (path is null)
        {
            return;
        }

        foreach (var line in File.ReadLines(path))
        {
            var trimmed = line.Trim();

            if (trimmed.Length == 0 || trimmed.StartsWith('#'))
            {
                continue;
            }

            var separatorIndex = trimmed.IndexOf('=');

            if (separatorIndex <= 0)
            {
                continue;
            }

            var key = trimmed[..separatorIndex].Trim();
            var value = trimmed[(separatorIndex + 1)..].Trim().Trim('"', '\'');

            // Real environment variables win over the file.
            if (Environment.GetEnvironmentVariable(key) is null)
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }

    private static string? Find(string fileName)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        for (var depth = 0; depth < MaxSearchDepth && directory is not null; depth++)
        {
            var candidate = Path.Combine(directory.FullName, fileName);

            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        return null;
    }
}
