using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using TheBuilder.WebAnalytics.Configuration;

namespace TheBuilder.WebAnalytics.Services;

public interface IVercelProjectNameService
{
    Task<string> GetDisplayNameAsync(
        VercelAnalyticsConnection connection,
        CancellationToken cancellationToken);
}

public sealed class VercelProjectNameService(
    IVercelAnalyticsClient client,
    IMemoryCache cache) : IVercelProjectNameService
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    public async Task<string> GetDisplayNameAsync(
        VercelAnalyticsConnection connection,
        CancellationToken cancellationToken)
    {
        var fallback = FirstNonEmpty(connection.ProjectId, connection.DisplayName, connection.Key.ToString());
        if (!connection.IsConfigured) return fallback;

        var cacheKey = string.Join(':',
            "vercel-project-name",
            connection.Key,
            connection.ProjectId,
            connection.Team ?? string.Empty);

        try
        {
            return await cache.GetOrCreateAsync(cacheKey, async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = CacheDuration;
                return await client.GetProjectNameAsync(connection, cancellationToken);
            }) ?? fallback;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return fallback;
        }
        catch (VercelAnalyticsApiException)
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
