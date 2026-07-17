using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;

namespace Umbraco.VercelAnalytics.Services;

public interface IVercelAnalyticsClient
{
    Task<string> GetProjectNameAsync(
        VercelAnalyticsConnection connection,
        CancellationToken cancellationToken);

    Task<AnalyticsTotals> CountAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken);

    Task<long> GetPageViewTotalAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsPoint>> GetTrendAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsBreakdownRow>> GetBreakdownAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken);

    Task<AnalyticsEventTotals> CountEventsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsEventRow>> GetEventsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        int limit,
        string? search,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsFlagRow>> GetFlagsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string? flagKey,
        int limit,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<string>> GetEventPropertyNamesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsEventPropertyValue>> GetEventPropertyValuesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        string propertyName,
        int limit,
        string? search,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken);
}
