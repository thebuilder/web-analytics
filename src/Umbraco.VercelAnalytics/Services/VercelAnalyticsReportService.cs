using Microsoft.Extensions.Caching.Memory;
using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;

namespace Umbraco.VercelAnalytics.Services;

public sealed class VercelAnalyticsReportService(
    VercelAnalyticsConnectionRegistry registry,
    IVercelAnalyticsClient client,
    IMemoryCache cache)
{
    public async Task<AnalyticsSummary?> GetSummaryAsync(
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var connection = registry.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var cacheKey = $"vercel-analytics:{registry.SettingsRevision}:summary:{Normalize(query)}";
        return await cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = registry.Settings.CacheDuration;
            var totals = client.CountAsync(connection, query, cancellationToken);
            var trend = client.GetTrendAsync(connection, query, cancellationToken);
            await Task.WhenAll(totals, trend);
            return new AnalyticsSummary(await totals, await trend);
        });
    }

    public async Task<AnalyticsBreakdown?> GetBreakdownAsync(
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        CancellationToken cancellationToken)
    {
        var connection = registry.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var cacheKey = $"vercel-analytics:{registry.SettingsRevision}:breakdown:{dimension}:{limit}:{Normalize(query)}";
        return await cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = registry.Settings.CacheDuration;
            var rows = await client.GetBreakdownAsync(connection, query, dimension, limit, cancellationToken);
            return new AnalyticsBreakdown(dimension, rows);
        });
    }

    private static string Normalize(AnalyticsQuery query) =>
        $"{query.Connection.ToLowerInvariant()}:{query.From:yyyyMMdd}:{query.To:yyyyMMdd}:{query.Interval}:{query.RequestPath}";
}
