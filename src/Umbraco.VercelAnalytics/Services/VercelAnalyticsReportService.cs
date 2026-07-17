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
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:summary:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async () =>
        {
            var count = client.CountAsync(connection, query, cancellationToken);
            var pageViews = client.GetPageViewTotalAsync(connection, query, cancellationToken);
            var previousTotals = TryGetPreviousTotalsAsync(connection, query, cancellationToken);
            var trend = client.GetTrendAsync(connection, query, cancellationToken);
            await Task.WhenAll(count, pageViews, previousTotals, trend);
            var points = await trend;
            var totals = new AnalyticsTotals(await pageViews, (await count).Visitors);
            return new AnalyticsSummary(totals, await previousTotals, points);
        });
    }

    public async Task<AnalyticsBreakdown?> GetBreakdownAsync(
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken)
    {
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var normalizedSearch = search?.Trim();
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:breakdown:{dimension}:{limit}:{normalizedSearch}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async () =>
        {
            var rows = await client.GetBreakdownAsync(connection, query, dimension, limit, normalizedSearch, cancellationToken);
            return new AnalyticsBreakdown(dimension, rows);
        });
    }

    public async Task<AnalyticsEventsReport?> GetEventsAsync(
        AnalyticsQuery query,
        int limit,
        string? search,
        CancellationToken cancellationToken)
    {
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var normalizedSearch = search?.Trim();
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:events:{limit}:{normalizedSearch}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async () =>
        {
            var rows = await client.GetEventsAsync(connection, query, limit, normalizedSearch, cancellationToken);
            return new AnalyticsEventsReport(rows);
        });
    }

    public async Task<AnalyticsFlagsReport?> GetFlagsAsync(
        AnalyticsQuery query,
        string? flagKey,
        int limit,
        CancellationToken cancellationToken)
    {
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var normalizedFlagKey = string.IsNullOrWhiteSpace(flagKey) ? null : flagKey.Trim();
        var flagKeyCacheKey = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(normalizedFlagKey ?? string.Empty));
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:flags:{flagKeyCacheKey}:{limit}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async () =>
        {
            var rows = await client.GetFlagsAsync(connection, query, normalizedFlagKey, limit, cancellationToken);
            return new AnalyticsFlagsReport(normalizedFlagKey, rows);
        });
    }

    public async Task<AnalyticsEventDetails?> GetEventDetailsAsync(
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var normalizedEventName = eventName.Trim();
        var eventDataCacheKey = eventDataFilter is null
            ? string.Empty
            : $":{Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(eventDataFilter.Property))}:{Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(eventDataFilter.Value))}";
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:event-details:{normalizedEventName}{eventDataCacheKey}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async () =>
        {
            var totals = client.CountEventsAsync(connection, query, normalizedEventName, eventDataFilter, cancellationToken);
            var propertyNamesTask = client.GetEventPropertyNamesAsync(connection, query, normalizedEventName, eventDataFilter, cancellationToken);
            await Task.WhenAll(totals, propertyNamesTask);
            var propertyNames = await propertyNamesTask;
            var properties = propertyNames
                .Select(propertyName => new AnalyticsEventProperty(propertyName, []))
                .ToArray();
            return new AnalyticsEventDetails(normalizedEventName, await totals, properties);
        });
    }

    public async Task<AnalyticsEventProperty?> GetEventPropertyValuesAsync(
        AnalyticsQuery query,
        string eventName,
        string propertyName,
        int limit,
        string? search,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var normalizedEventName = eventName.Trim();
        var normalizedPropertyName = propertyName.Trim();
        var normalizedSearch = search?.Trim();
        var eventDataCacheKey = eventDataFilter is null
            ? string.Empty
            : $":{Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(eventDataFilter.Property))}:{Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(eventDataFilter.Value))}";
        var eventNameCacheKey = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(normalizedEventName));
        var propertyNameCacheKey = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(normalizedPropertyName));
        var searchCacheKey = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(normalizedSearch ?? string.Empty));
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:event-property-values:{eventNameCacheKey}:{propertyNameCacheKey}:{limit}:{searchCacheKey}{eventDataCacheKey}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async () =>
        {
            var values = await client.GetEventPropertyValuesAsync(
                connection,
                query,
                normalizedEventName,
                normalizedPropertyName,
                limit,
                normalizedSearch,
                eventDataFilter,
                cancellationToken);
            return new AnalyticsEventProperty(normalizedPropertyName, values);
        });
    }

    private Task<T> GetOrCreateAsync<T>(
        string cacheKey,
        TimeSpan cacheDuration,
        Func<Task<T>> factory)
    {
        if (cacheDuration <= TimeSpan.Zero)
        {
            return factory();
        }

        return cache.GetOrCreateAsync(cacheKey, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = cacheDuration;
            return factory();
        })!;
    }

    private static string Normalize(AnalyticsQuery query)
    {
        var filters = string.Join(",", (query.Filters ?? [])
            .OrderBy(filter => filter.Dimension)
            .Select(filter => $"{filter.Dimension}:{Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(filter.Value))}"));
        return $"{query.Connection:N}:{query.From.UtcTicks}:{query.To.UtcTicks}:{query.Interval}:{query.RequestPath}:{filters}";
    }

    private async Task<AnalyticsTotals?> TryGetPreviousTotalsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var duration = query.To - query.From;
        if (duration <= TimeSpan.Zero || query.From - DateTimeOffset.MinValue < duration) return null;

        var previousQuery = query with
        {
            From = query.From - duration,
            To = query.From
        };

        try
        {
            var count = client.CountAsync(connection, previousQuery, cancellationToken);
            var pageViews = client.GetPageViewTotalAsync(connection, previousQuery, cancellationToken);
            await Task.WhenAll(count, pageViews);
            return new AnalyticsTotals(await pageViews, (await count).Visitors);
        }
        catch (VercelAnalyticsApiException)
        {
            return null;
        }
    }
}
