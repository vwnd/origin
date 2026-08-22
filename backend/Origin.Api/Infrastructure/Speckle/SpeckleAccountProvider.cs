using Microsoft.Extensions.Options;
using Speckle.Sdk.Credentials;

namespace Origin.Api.Infrastructure.Speckle;

/// <summary>
/// Resolves the account the API uses to talk to Speckle. Building an account costs a round trip
/// to the server (it resolves the user and server info behind the token), so the result is cached
/// for the lifetime of the process.
/// </summary>
public class SpeckleAccountProvider(IAccountFactory accountFactory, IOptions<SpeckleOptions> options)
{
    private readonly SpeckleOptions _options = options.Value;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private Account? _account;

    public async Task<Account> GetAccountAsync(CancellationToken cancellationToken = default)
    {
        if (_account is not null)
        {
            return _account;
        }

        await _gate.WaitAsync(cancellationToken);

        try
        {
            if (string.IsNullOrWhiteSpace(_options.Token))
            {
                throw new InvalidOperationException(
                    "Missing Speckle token. Set SPECKLE_TOKEN in the repository root .env file.");
            }

            return _account ??= await accountFactory.CreateAccount(
                new Uri(_options.ServerUrl),
                _options.Token,
                cancellationToken: cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }
}
