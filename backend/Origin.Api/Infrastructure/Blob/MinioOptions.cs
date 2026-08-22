namespace Origin.Api.Infrastructure.Blob;

public class MinioOptions
{
    public const string SectionName = "Minio";

    public required string Endpoint { get; init; }

    public required string AccessKey { get; init; }

    public required string SecretKey { get; init; }

    public required string BucketName { get; init; }

    public bool UseSsl { get; init; }

    public int PresignedUrlExpirySeconds { get; init; } = 3600;
}
