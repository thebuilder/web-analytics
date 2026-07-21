using System.Text.Json;
using System.Runtime.ExceptionServices;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public sealed class AnalyticsReportService(
    AnalyticsConnectionRegistry registry,
    IAnalyticsProviderClientResolver clients,
    AnalyticsReportCache cache)
{
    public async Task<AnalyticsSummary?> GetSummaryAsync(
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured) return null;
        var client = clients.Get(connection);
        var cacheKey = $"web-analytics:{connection.Provider}:{snapshot.Revision}:summary:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var totals = client.GetTotalsAsync(connection, query, operationCancellationToken);
            var previousTotals = TryGetPreviousTotalsAsync(connection, query, operationCancellationToken);
            var trend = client.GetTrendAsync(connection, query, operationCancellationToken);
            await Task.WhenAll(totals, previousTotals, trend);
            var points = await trend;
            return new AnalyticsSummary(await totals, await previousTotals, points);
        }, cancellationToken);
    }

    public async Task<AnalyticsBreakdown?> GetBreakdownAsync(
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken,
        AnalyticsTrafficMetric? orderBy = null)
    {
        var snapshot = registry.Capture();
        var connection = snapshot.Get(query.Connection);
        if (connection is null || !connection.IsConfigured || !connection.Capabilities.Dimensions.Contains(dimension)) return null;
        var client = clients.Get(connection);
        var normalizedSearch = search?.Trim();
        var cacheKey = $"web-analytics:{connection.Provider}:{snapshot.Revision}:breakdown:{dimension}:{orderBy}:{limit}:{normalizedSearch}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var rows = await client.GetBreakdownAsync(connection, query, dimension, limit, normalizedSearch, operationCancellationToken, orderBy);
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
        if (connection is null || !connection.IsConfigured || !connection.Capabilities.Events) return null;
        var client = (IAnalyticsEventsProviderClient)clients.Get(connection);
        var normalizedSearch = search?.Trim();
        var cacheKey = $"web-analytics:{connection.Provider}:{snapshot.Revision}:events:{limit}:{normalizedSearch}:{Normalize(query)}";
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
        if (connection is null || !connection.IsConfigured || !connection.Capabilities.Flags) return null;
        var client = (IAnalyticsFlagsProviderClient)clients.Get(connection);
        var normalizedFlagKey = string.IsNullOrWhiteSpace(flagKey) ? null : flagKey.Trim();
        var flagKeyCacheKey = EncodeCachePart(normalizedFlagKey ?? string.Empty);
        var cacheKey = $"web-analytics:{connection.Provider}:{snapshot.Revision}:flags:{flagKeyCacheKey}:{limit}:{Normalize(query)}";
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
        if (connection is null || !connection.IsConfigured || !connection.Capabilities.EventDetails) return null;
        var client = (IAnalyticsEventDetailsProviderClient)clients.Get(connection);
        var normalizedEventName = eventName.Trim();
        var eventDataCacheKey = eventDataFilter is null
            ? string.Empty
            : $":{EncodeCachePart(eventDataFilter.Property)}:{EncodeCachePart(eventDataFilter.Value)}";
        var cacheKey = $"web-analytics:{connection.Provider}:{snapshot.Revision}:event-details:{EncodeCachePart(normalizedEventName)}{eventDataCacheKey}:{Normalize(query)}";
        return await GetOrCreateAsync(cacheKey, snapshot.Settings.CacheDuration, async operationCancellationToken =>
        {
            var propertiesClient = client as IAnalyticsEventPropertiesProviderClient;
            var totals = eventDataFilter is null
                ? client.CountEventsAsync(connection, query, normalizedEventName, operationCancellationToken)
                : propertiesClient?.CountFilteredEventsAsync(connection, query, normalizedEventName, eventDataFilter, operationCancellationToken)
                    ?? throw new InvalidOperationException($"{connection.Provider} does not support event property filters.");
            var propertiesTask = GetEventPropertiesAsync(
                connection,
                snapshot.Revision,
                snapshot.Settings.CacheDuration,
                query,
                normalizedEventName,
                propertiesClient,
                eventDataFilter,
                operationCancellationToken);
            await Task.WhenAll(totals, propertiesTask);
            return new AnalyticsEventDetails(normalizedEventName, await totals, await propertiesTask);
        }, cancellationToken);
    }

    private async Task<IReadOnlyList<AnalyticsEventProperty>> GetEventPropertiesAsync(
        AnalyticsConnection connection,
        long revision,
        TimeSpan cacheDuration,
        AnalyticsQuery query,
        string eventName,
        IAnalyticsEventPropertiesProviderClient? client,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        if (client is null) return [];
        if (client is not IAnalyticsEventPropertyDiscoveryProviderClient discoveryClient)
        {
            var propertyNames = await client.GetEventPropertyNamesAsync(connection, query, eventName, eventDataFilter, cancellationToken);
            return propertyNames.Select(propertyName => new AnalyticsEventProperty(propertyName, [])).ToArray();
        }

        var eventDataCacheKey = eventDataFilter is null
            ? string.Empty
            : $":{EncodeCachePart(eventDataFilter.Property)}:{EncodeCachePart(eventDataFilter.Value)}";
        var cacheKey = $"web-analytics:{connection.Provider}:{revision}:event-property-discovery{eventDataCacheKey}:{Normalize(query)}";
        var propertiesByEvent = await GetOrCreateAsync(
            cacheKey,
            cacheDuration,
            operationCancellationToken => discoveryClient.DiscoverEventPropertiesAsync(
                connection,
                query,
                eventDataFilter,
                operationCancellationToken),
            cancellationToken);
        return propertiesByEvent.TryGetValue(eventName, out var properties) ? properties : [];
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
        if (connection is null || !connection.IsConfigured || !connection.Capabilities.EventProperties) return null;
        var client = (IAnalyticsEventPropertiesProviderClient)clients.Get(connection);
        var normalizedEventName = eventName.Trim();
        var normalizedPropertyName = propertyName.Trim();
        var normalizedSearch = search?.Trim();
        var eventDataCacheKey = eventDataFilter is null
            ? string.Empty
            : $":{EncodeCachePart(eventDataFilter.Property)}:{EncodeCachePart(eventDataFilter.Value)}";
        var eventNameCacheKey = EncodeCachePart(normalizedEventName);
        var propertyNameCacheKey = EncodeCachePart(normalizedPropertyName);
        var searchCacheKey = EncodeCachePart(normalizedSearch ?? string.Empty);
        var cacheKey = $"web-analytics:{connection.Provider}:{snapshot.Revision}:event-property-values:{eventNameCacheKey}:{propertyNameCacheKey}:{limit}:{searchCacheKey}{eventDataCacheKey}:{Normalize(query)}";
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
        AnalyticsConnection connection,
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
            var totals = clients.Get(connection).GetTotalsAsync(connection, previousQuery, cancellationToken);
            comparison = totals;
            await comparison;
            return await totals;
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
        failure is AnalyticsProviderApiException or HttpRequestException or JsonException or OperationCanceledException;

}
