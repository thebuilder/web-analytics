using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public interface IAnalyticsProviderClient
{
    AnalyticsProvider Provider { get; }

    AnalyticsCapabilities Capabilities { get; }

    Task<string> GetDisplayNameAsync(
        AnalyticsConnection connection,
        CancellationToken cancellationToken);

    Task<AnalyticsTotals> GetTotalsAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsPoint>> GetTrendAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsBreakdownRow>> GetBreakdownAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken);

}

public interface IAnalyticsEventsProviderClient
{
    Task<IReadOnlyList<AnalyticsEventRow>> GetEventsAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        int limit,
        string? search,
        CancellationToken cancellationToken);
}

public interface IAnalyticsEventPropertiesProviderClient
{
    Task<AnalyticsEventTotals> CountEventsAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<string>> GetEventPropertyNamesAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsEventPropertyValue>> GetEventPropertyValuesAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        string propertyName,
        int limit,
        string? search,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken);
}

public interface IAnalyticsFlagsProviderClient
{
    Task<IReadOnlyList<AnalyticsFlagRow>> GetFlagsAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string? flagKey,
        int limit,
        CancellationToken cancellationToken);
}

public interface IAnalyticsProviderClientResolver
{
    IAnalyticsProviderClient Get(AnalyticsConnection connection);
}
