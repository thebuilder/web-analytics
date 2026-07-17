using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;

namespace Umbraco.VercelAnalytics.Models;

public sealed class AnalyticsProblemDetails : ProblemDetails
{
    public string Code { get; init; } = string.Empty;
}

[JsonConverter(typeof(JsonStringEnumConverter<AnalyticsInterval>))]
public enum AnalyticsInterval
{
    Hour,
    Day,
    Week,
    Month
}

[JsonConverter(typeof(JsonStringEnumConverter<AnalyticsDimension>))]
public enum AnalyticsDimension
{
    RequestPath,
    Route,
    ReferrerHostname,
    Country,
    DeviceType,
    BrowserName,
    OsName,
    UtmSource,
    UtmMedium,
    UtmCampaign,
    UtmTerm,
    UtmContent,
    EventName
}

public sealed record AnalyticsQuery(
    Guid Connection,
    DateTimeOffset From,
    DateTimeOffset To,
    AnalyticsInterval Interval,
    string? RequestPath = null,
    IReadOnlyList<AnalyticsFilter>? Filters = null)
{
    internal AnalyticsQuery(
        Guid Connection,
        DateOnly From,
        DateOnly To,
        AnalyticsInterval Interval,
        string? RequestPath = null,
        IReadOnlyList<AnalyticsFilter>? Filters = null)
        : this(
            Connection,
            new DateTimeOffset(From.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            new DateTimeOffset(To.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            Interval,
            RequestPath,
            Filters)
    {
    }
}

public sealed record AnalyticsFilter(AnalyticsDimension Dimension, string Value);

public sealed record AnalyticsEventDataFilter(string Property, string Value);

public sealed record AnalyticsTotals(long PageViews, long Visitors);

public sealed record AnalyticsPoint(DateTimeOffset Timestamp, long PageViews, long Visitors);

public sealed record AnalyticsSummary(
    AnalyticsTotals Totals,
    AnalyticsTotals? PreviousTotals,
    IReadOnlyList<AnalyticsPoint> Points);

public sealed record AnalyticsBreakdownRow(string Value, long PageViews, long Visitors);

public sealed record AnalyticsBreakdown(
    AnalyticsDimension Dimension,
    IReadOnlyList<AnalyticsBreakdownRow> Rows);

public sealed record AnalyticsEventTotals(long Count, long Visitors);

public sealed record AnalyticsEventRow(string EventName, long Count, long Visitors);

public sealed record AnalyticsEventsReport(IReadOnlyList<AnalyticsEventRow> Rows);

public sealed record AnalyticsFlagRow(string Value, long PageViews, long Visitors);

public sealed record AnalyticsFlagsReport(string? FlagKey, IReadOnlyList<AnalyticsFlagRow> Rows);

public sealed record AnalyticsEventPropertyValue(string Value, long Count, long Visitors);

public sealed record AnalyticsEventProperty(
    string Name,
    IReadOnlyList<AnalyticsEventPropertyValue> Values);

public sealed record AnalyticsEventDetails(
    string EventName,
    AnalyticsEventTotals Totals,
    IReadOnlyList<AnalyticsEventProperty> Properties);

public sealed record AnalyticsConnectionSummary(
    Guid Key,
    string DisplayName,
    bool IsDefault,
    bool IsConfigured,
    string? BaseUrl,
    IReadOnlyList<string> Warnings);

public sealed record AnalyticsConnectionsResponse(
    bool Enabled,
    int DefaultRangeDays,
    IReadOnlyList<AnalyticsConnectionSummary> Connections);

public sealed record AnalyticsDocumentRoute(
    Guid Connection,
    string Culture,
    string Hostname,
    string Path,
    string Url,
    bool IsCurrent,
    IReadOnlyList<string> Warnings);

public sealed record AnalyticsSettingsResponse(
    bool Enabled,
    bool HasAccessToken,
    int DefaultRangeDays,
    string CacheDuration,
    IReadOnlyList<AnalyticsConnectionSettingsResponse> Connections);

public sealed record AnalyticsConnectionSettingsResponse(
    Guid Key,
    string DisplayName,
    string ProjectId,
    string? Team,
    IReadOnlyList<string> DocumentRootKeys,
    bool EnableAllDocumentTypes,
    IReadOnlyList<string> EnabledDocumentTypeKeys,
    bool HasAccessToken,
    bool HasAccessTokenOverride);

public sealed record UpdateAnalyticsSettingsRequest(
    bool Enabled,
    int DefaultRangeDays,
    string CacheDuration,
    IReadOnlyList<UpdateAnalyticsConnectionRequest> Connections);

public sealed record UpdateAnalyticsConnectionRequest(
    Guid Key,
    string DisplayName,
    string ProjectId,
    string? Team,
    IReadOnlyList<string> DocumentRootKeys,
    bool EnableAllDocumentTypes,
    IReadOnlyList<string> EnabledDocumentTypeKeys);

public sealed record AnalyticsConnectionTestResult(bool Success, string Message);
