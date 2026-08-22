namespace Origin.Api.Infrastructure.Blob;

public interface IBlobStorageService
{
    Task<string> GetPresignedDownloadUrlAsync(string objectName, CancellationToken cancellationToken = default);

    Task<string> GetTextAsync(string objectName, CancellationToken cancellationToken = default);

    Task UploadTextAsync(string objectName, string content, CancellationToken cancellationToken = default);

    Task DeleteAsync(string objectName, CancellationToken cancellationToken = default);
}
