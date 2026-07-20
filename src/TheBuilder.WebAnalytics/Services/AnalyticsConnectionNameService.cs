using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using TheBuilder.WebAnalytics.Configuration;

namespace TheBuilder.WebAnalytics.Services;

public interface IAnalyticsConnectionNameService
{
    Task<string> GetDisplayNameAsync(
        AnalyticsConnection connection,
        CancellationToken cancellationToken);
}

public sealed class AnalyticsConnectionNameService(
    IAnalyticsProviderClientResolver clients,
    AnalyticsProviderCatalog providerCatalog,
    IMemoryCache cache) : IAnalyticsConnectionNameService
{
    internal AnalyticsConnectionNameService(IAnalyticsProviderClient client, IMemoryCache cache)
        : this(new SingleAnalyticsProviderClientResolver(client), AnalyticsProviderCatalog.Default, cache)
    {
    }

    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    public async Task<string> GetDisplayNameAsync(
        AnalyticsConnection connection,
        CancellationToken cancellationToken)
    {
        var fallback = FirstNonEmpty(
            providerCatalog.Get(connection.Provider).GetIdentifier(connection),
            connection.DisplayName,
            connection.Key.ToString());
        if (!connection.IsConfigured) return fallback;

        var cacheKey = string.Join(':',
            "analytics-connection-name",
            connection.Key,
            connection.Provider,
            connection.ProjectId,
            connection.SiteId,
            connection.Team ?? string.Empty);

        try
        {
            return await cache.GetOrCreateAsync(cacheKey, async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = CacheDuration;
                return await clients.Get(connection).GetDisplayNameAsync(connection, cancellationToken);
            }) ?? fallback;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return fallback;
        }
        catch (AnalyticsProviderApiException)
        {
            return fallback;
        }
        catch (HttpRequestException)
        {
            return fallback;
        }
        catch (JsonException)
        {
            return fallback;
        }
    }

    private static string FirstNonEmpty(params string[] values) =>
        values.First(value => !string.IsNullOrWhiteSpace(value));
}
