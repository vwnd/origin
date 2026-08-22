using System.Text;
using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;

namespace Origin.Api.Infrastructure.Blob;

public class MinioBlobStorageService(IMinioClient minioClient, IOptions<MinioOptions> options) : IBlobStorageService
{
    private readonly MinioOptions _options = options.Value;

    public async Task<string> GetPresignedDownloadUrlAsync(string objectName, CancellationToken cancellationToken = default)
    {
        var args = new PresignedGetObjectArgs()
            .WithBucket(_options.BucketName)
            .WithObject(objectName)
            .WithExpiry(_options.PresignedUrlExpirySeconds);

        return await minioClient.PresignedGetObjectAsync(args);
    }

    public async Task<string> GetTextAsync(string objectName, CancellationToken cancellationToken = default)
    {
        using var buffer = new MemoryStream();

        var args = new GetObjectArgs()
            .WithBucket(_options.BucketName)
            .WithObject(objectName)
            .WithCallbackStream((stream, ct) => stream.CopyToAsync(buffer, ct));

        await minioClient.GetObjectAsync(args, cancellationToken);

        buffer.Position = 0;
        using var reader = new StreamReader(buffer, Encoding.UTF8);

        return await reader.ReadToEndAsync(cancellationToken);
    }

    public async Task UploadTextAsync(string objectName, string content, CancellationToken cancellationToken = default)
    {
        var bucketExists = await minioClient.BucketExistsAsync(
            new BucketExistsArgs().WithBucket(_options.BucketName),
            cancellationToken);

        if (!bucketExists)
        {
            await minioClient.MakeBucketAsync(new MakeBucketArgs().WithBucket(_options.BucketName), cancellationToken);
        }

        var bytes = Encoding.UTF8.GetBytes(content);
        using var stream = new MemoryStream(bytes);

        var args = new PutObjectArgs()
            .WithBucket(_options.BucketName)
            .WithObject(objectName)
            .WithStreamData(stream)
            .WithObjectSize(bytes.Length)
            .WithContentType("text/markdown");

        await minioClient.PutObjectAsync(args, cancellationToken);
    }

    public async Task DeleteAsync(string objectName, CancellationToken cancellationToken = default)
    {
        var args = new RemoveObjectArgs()
            .WithBucket(_options.BucketName)
            .WithObject(objectName);

        await minioClient.RemoveObjectAsync(args, cancellationToken);
    }
}
