using System.Text.Json.Serialization;
using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.WebAnalytics.Configuration;

namespace TheBuilder.WebAnalytics.Models;

public sealed class AnalyticsProblemDetails : ProblemDetails
{
    public string Code { get; init; } = string.Empty;
}

[JsonConverter(typeof(JsonStringEnumConverter<AnalyticsProvider>))]
public enum AnalyticsProvider
{
    Vercel,
    Plausible
}

[JsonConverter(typeof(JsonStringEnumConverter<AnalyticsInterval>))]
public enum AnalyticsInterval
{
    Hour,
    Day,
    Week,
    Month
}

[JsonConverter(typeof(JsonStringEnumConverter<AnalyticsTrafficMetric>))]
public enum AnalyticsTrafficMetric
{
    Visitors,
    PageViews
}

[JsonConverter(typeof(JsonStringEnumConverter<MockAnalyticsScenario>))]
public enum MockAnalyticsScenario
{
    Complete,
    Utm,
    Flags,
    Events
}

[JsonConverter(typeof(JsonStringEnumConverter<AnalyticsDimension>))]
public enum AnalyticsDimension
{
    RequestPath,
    Route,
    ReferrerHostname,
    Referrer,
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

public sealed record AnalyticsCapabilities(
    IReadOnlyList<AnalyticsDimension> Dimensions,
    bool Events,
    bool EventDetails,
    bool EventProperties,
    bool GlobalEventFiltering,
    bool Flags,
    bool BreakdownOrdering);

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

public sealed record AnalyticsPoint(string Timestamp, long PageViews, long Visitors)
{
    public AnalyticsPoint(DateTimeOffset timestamp, long pageViews, long visitors)
        : this(timestamp.ToString("O", CultureInfo.InvariantCulture), pageViews, visitors)
    {
    }
}

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
    AnalyticsProvider Provider,
    AnalyticsCapabilities Capabilities,
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
    AnalyticsProvider Provider,
    AnalyticsCapabilities Capabilities,
    string Culture,
    string Hostname,
    string Path,
    string Url,
    bool IsCurrent,
    IReadOnlyList<string> Warnings);

public sealed record AnalyticsSettingsResponse(
    bool Enabled,
    IReadOnlyList<AnalyticsProviderTokenStatus> ProviderTokens,
    bool CanCreateMockConnections,
    int DefaultRangeDays,
    string CacheDuration,
    IReadOnlyList<AnalyticsConnectionSettingsResponse> Connections);

public sealed class AnalyticsConnectionSettingsResponse
{
    public required Guid Key { get; init; }
    public required string DisplayName { get; init; }
    public required AnalyticsProvider Provider { get; init; }
    public required string ProjectId { get; init; }
    public string? Team { get; init; }
    public required string SiteId { get; init; }
    public IReadOnlyList<string> EventPropertyNames { get; init; } = [];
    public required IReadOnlyList<string> DocumentRootKeys { get; init; }
    public required bool EnableAllDocumentTypes { get; init; }
    public required IReadOnlyList<string> EnabledDocumentTypeKeys { get; init; }
    public required bool HasAccessToken { get; init; }
    public required bool HasAccessTokenOverride { get; init; }
    public MockAnalyticsScenario? MockScenario { get; init; }
}

public sealed record UpdateAnalyticsSettingsRequest(
    bool Enabled,
    int DefaultRangeDays,
    string CacheDuration,
    IReadOnlyList<UpdateAnalyticsConnectionRequest> Connections);

public sealed class UpdateAnalyticsConnectionRequest
{
    public required Guid Key { get; init; }
    public required string DisplayName { get; init; }
    public required AnalyticsProvider Provider { get; init; }
    public required string ProjectId { get; init; }
    public string? Team { get; init; }
    public required string SiteId { get; init; }
    public IReadOnlyList<string> EventPropertyNames { get; init; } = [];
    public MockAnalyticsScenario? MockScenario { get; init; }
    public required IReadOnlyList<string> DocumentRootKeys { get; init; }
    public required bool EnableAllDocumentTypes { get; init; }
    public required IReadOnlyList<string> EnabledDocumentTypeKeys { get; init; }
}

public sealed record AnalyticsProviderTokenStatus(
    AnalyticsProvider Provider,
    bool HasAccessToken);

public sealed record AnalyticsConnectionTestResult(bool Success, string Message);
