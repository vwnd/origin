using Microsoft.EntityFrameworkCore;
using Minio;
using Origin.Api.Infrastructure.Blob;
using Origin.Api.Infrastructure.Configuration;
using Origin.Api.Infrastructure.Speckle;
using Origin.Api.Persistence;
using Speckle.Sdk;

// The Speckle token is kept in a gitignored .env at the repository root, shared with the frontend.
DotEnvFile.Load();

var builder = WebApplication.CreateBuilder(args);

var speckleToken = builder.Configuration["SPECKLE_TOKEN"];

if (!string.IsNullOrWhiteSpace(speckleToken))
{
    builder.Configuration[$"{SpeckleOptions.SectionName}:{nameof(SpeckleOptions.Token)}"] = speckleToken;
}

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

builder.Services.Configure<MinioOptions>(builder.Configuration.GetSection(MinioOptions.SectionName));

builder.Services.AddSingleton<IMinioClient>(sp =>
{
    var options = builder.Configuration.GetSection(MinioOptions.SectionName).Get<MinioOptions>()
        ?? throw new InvalidOperationException($"Missing '{MinioOptions.SectionName}' configuration section.");

    return new MinioClient()
        .WithEndpoint(options.Endpoint)
        .WithCredentials(options.AccessKey, options.SecretKey)
        .WithSSL(options.UseSsl)
        .Build();
});

builder.Services.AddScoped<IBlobStorageService, MinioBlobStorageService>();

builder.Services.Configure<SpeckleOptions>(builder.Configuration.GetSection(SpeckleOptions.SectionName));
builder.Services.AddSpeckleSdk(new Application("Origin", "origin"), typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0");
builder.Services.AddSingleton<SpeckleAccountProvider>();
builder.Services.AddScoped<ISpeckleProjectClient, SpeckleProjectClient>();

builder.Services.AddScoped<DevelopmentDataSeeder>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<DevelopmentDataSeeder>().SeedAsync();
}

app.UseAuthorization();

app.MapControllers();

app.Run();
