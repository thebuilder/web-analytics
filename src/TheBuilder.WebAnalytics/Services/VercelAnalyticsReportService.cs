using System.Text.Json;
using System.Runtime.ExceptionServices;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public sealed class VercelAnalyticsReportService(
    VercelAnalyticsConnectionRegistry registry,
    IVercelAnalyticsClient client,
    AnalyticsReportCache cache)
{
    public async Task<AnalyticsSummary?> GetSummaryAsync(
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:summary:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var count = client.CountAsync(connection, query, operationCancellationToken);
            var pageViews = client.GetPageViewTotalAsync(connection, query, operationCancellationToken);
            var previousTotals = TryGetPreviousTotalsAsync(connection, query, operationCancellationToken);
            var trend = client.GetTrendAsync(connection, query, operationCancellationToken);
            await Task.WhenAll(count, pageViews, previousTotals, trend);
            var points = await trend;
            var totals = new AnalyticsTotals(await pageViews, (await count).Visitors);
            return new AnalyticsSummary(totals, await previousTotals, points);
        }, cancellationToken);
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
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var rows = await client.GetBreakdownAsync(connection, query, dimension, limit, normalizedSearch, operationCancellationToken);
            return new AnalyticsBreakdown(dimension, rows);
        }, cancellationToken);
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
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var rows = await client.GetEventsAsync(connection, query, limit, normalizedSearch, operationCancellationToken);
            return new AnalyticsEventsReport(rows);
        }, cancellationToken);
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
        var flagKeyCacheKey = EncodeCachePart(normalizedFlagKey ?? string.Empty);
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:flags:{flagKeyCacheKey}:{limit}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var rows = await client.GetFlagsAsync(connection, query, normalizedFlagKey, limit, operationCancellationToken);
            return new AnalyticsFlagsReport(normalizedFlagKey, rows);
        }, cancellationToken);
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
            : $":{EncodeCachePart(eventDataFilter.Property)}:{EncodeCachePart(eventDataFilter.Value)}";
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:event-details:{EncodeCachePart(normalizedEventName)}{eventDataCacheKey}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var totals = client.CountEventsAsync(connection, query, normalizedEventName, eventDataFilter, operationCancellationToken);
            var propertyNamesTask = client.GetEventPropertyNamesAsync(connection, query, normalizedEventName, eventDataFilter, operationCancellationToken);
            await Task.WhenAll(totals, propertyNamesTask);
            var propertyNames = await propertyNamesTask;
            var properties = propertyNames
                .Select(propertyName => new AnalyticsEventProperty(propertyName, []))
                .ToArray();
            return new AnalyticsEventDetails(normalizedEventName, await totals, properties);
        }, cancellationToken);
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
            : $":{EncodeCachePart(eventDataFilter.Property)}:{EncodeCachePart(eventDataFilter.Value)}";
        var eventNameCacheKey = EncodeCachePart(normalizedEventName);
        var propertyNameCacheKey = EncodeCachePart(normalizedPropertyName);
        var searchCacheKey = EncodeCachePart(normalizedSearch ?? string.Empty);
        var cacheKey = $"vercel-analytics:{snapshot.Revision}:event-property-values:{eventNameCacheKey}:{propertyNameCacheKey}:{limit}:{searchCacheKey}{eventDataCacheKey}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var values = await client.GetEventPropertyValuesAsync(
                connection,
                query,
                normalizedEventName,
                normalizedPropertyName,
                limit,
                normalizedSearch,
                eventDataFilter,
                operationCancellationToken);
            return new AnalyticsEventProperty(normalizedPropertyName, values);
        }, cancellationToken);
    }

    private Task<T> GetOrCreateAsync<T>(
        string cacheKey,
        TimeSpan cacheDuration,
        Func<CancellationToken, Task<T>> factory,
        CancellationToken cancellationToken) =>
        cache.GetOrCreateAsync(cacheKey, cacheDuration, factory, cancellationToken);

    private static string EncodeCachePart(string value) =>
        Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(value));

    private static string Normalize(AnalyticsQuery query)
    {
        var filters = string.Join(",", (query.Filters ?? [])
            .OrderBy(filter => filter.Dimension)
            .Select(filter => $"{filter.Dimension}:{EncodeCachePart(filter.Value)}"));
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

        Task? comparison = null;

        try
        {
            var count = client.CountAsync(connection, previousQuery, cancellationToken);
            var pageViews = client.GetPageViewTotalAsync(connection, previousQuery, cancellationToken);
            comparison = Task.WhenAll(count, pageViews);
            await comparison;
            return new AnalyticsTotals(await pageViews, (await count).Visitors);
        }
        catch (Exception failure)
        {
            IEnumerable<Exception> failures = comparison?.Exception?.Flatten().InnerExceptions ?? [failure];
            if (!cancellationToken.IsCancellationRequested)
            {
                var unexpected = failures.FirstOrDefault(failure => !IsOptionalComparisonFailure(failure));
                if (unexpected is null) return null;

                ExceptionDispatchInfo.Capture(unexpected).Throw();
            }

            throw;
        }
    }

    private static bool IsOptionalComparisonFailure(Exception failure) =>
        failure is VercelAnalyticsApiException or HttpRequestException or JsonException or OperationCanceledException;
}
