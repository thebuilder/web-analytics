using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public sealed class VercelAnalyticsClientRouter(
    VercelAnalyticsClient vercelClient,
    MockVercelAnalyticsClient mockClient) : IVercelAnalyticsClient
{
    public Task<string> GetProjectNameAsync(VercelAnalyticsConnection connection, CancellationToken cancellationToken) =>
        ClientFor(connection).GetProjectNameAsync(connection, cancellationToken);

    public Task<AnalyticsTotals> CountAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken) =>
        ClientFor(connection).CountAsync(connection, query, cancellationToken);

    public Task<long> GetPageViewTotalAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken) =>
        ClientFor(connection).GetPageViewTotalAsync(connection, query, cancellationToken);

    public Task<IReadOnlyList<AnalyticsPoint>> GetTrendAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken) =>
        ClientFor(connection).GetTrendAsync(connection, query, cancellationToken);

    public Task<IReadOnlyList<AnalyticsBreakdownRow>> GetBreakdownAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken) =>
        ClientFor(connection).GetBreakdownAsync(connection, query, dimension, limit, search, cancellationToken);

    public Task<AnalyticsEventTotals> CountEventsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken) =>
        ClientFor(connection).CountEventsAsync(connection, query, eventName, eventDataFilter, cancellationToken);

    public Task<IReadOnlyList<AnalyticsEventRow>> GetEventsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        int limit,
        string? search,
        CancellationToken cancellationToken) =>
        ClientFor(connection).GetEventsAsync(connection, query, limit, search, cancellationToken);

    public Task<IReadOnlyList<AnalyticsFlagRow>> GetFlagsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string? flagKey,
        int limit,
        CancellationToken cancellationToken) =>
        ClientFor(connection).GetFlagsAsync(connection, query, flagKey, limit, cancellationToken);

    public Task<IReadOnlyList<string>> GetEventPropertyNamesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken) =>
        ClientFor(connection).GetEventPropertyNamesAsync(connection, query, eventName, eventDataFilter, cancellationToken);

    public Task<IReadOnlyList<AnalyticsEventPropertyValue>> GetEventPropertyValuesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        string propertyName,
        int limit,
        string? search,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken) =>
        ClientFor(connection).GetEventPropertyValuesAsync(
            connection,
            query,
            eventName,
            propertyName,
            limit,
            search,
            eventDataFilter,
            cancellationToken);

    private IVercelAnalyticsClient ClientFor(VercelAnalyticsConnection connection) =>
        connection.IsMock ? mockClient : vercelClient;
}
