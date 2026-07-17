using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;

namespace Umbraco.VercelAnalytics.Services;

public sealed class MockVercelAnalyticsClient : IVercelAnalyticsClient
{
    private static readonly IReadOnlyDictionary<AnalyticsDimension, AnalyticsBreakdownRow[]> Breakdowns =
        new Dictionary<AnalyticsDimension, AnalyticsBreakdownRow[]>
        {
            [AnalyticsDimension.RequestPath] = [new("/", 12840, 7240), new("/products", 8950, 5110), new("/pricing", 5670, 3420), new("/guides/analytics", 3280, 2160)],
            [AnalyticsDimension.Route] = [new("/", 12840, 7240), new("/products", 8950, 5110), new("/pricing", 5670, 3420), new("/guides/[slug]", 3280, 2160)],
            [AnalyticsDimension.ReferrerHostname] = [new("google.com", 9340, 6110), new("linkedin.com", 4280, 2870), new("vercel.com", 3160, 2040), new("Direct", 2870, 1830)],
            [AnalyticsDimension.Country] = [new("DK", 10540, 6420), new("US", 8360, 4910), new("DE", 4720, 2890), new("GB", 3910, 2410)],
            [AnalyticsDimension.DeviceType] = [new("Desktop", 18940, 10420), new("Mobile", 9210, 6030), new("Tablet", 1280, 810)],
            [AnalyticsDimension.BrowserName] = [new("Chrome", 16420, 9410), new("Safari", 8240, 5070), new("Edge", 2830, 1760), new("Firefox", 1940, 1190)],
            [AnalyticsDimension.OsName] = [new("macOS", 10420, 6170), new("Windows", 8730, 5230), new("iOS", 6240, 3820), new("Android", 4010, 2490)],
            [AnalyticsDimension.UtmSource] = [new("newsletter", 6240, 3810), new("linkedin", 4880, 3190), new("google", 4270, 2860), new("partner", 2190, 1450)],
            [AnalyticsDimension.UtmMedium] = [new("email", 7310, 4420), new("social", 5260, 3410), new("cpc", 3980, 2670), new("referral", 1760, 1140)],
            [AnalyticsDimension.UtmCampaign] = [new("summer-launch", 5920, 3670), new("product-update", 4370, 2810), new("editorial-series", 2840, 1880), new("partner-webinar", 1760, 1120)],
            [AnalyticsDimension.UtmTerm] = [new("analytics dashboard", 1940, 1280), new("umbraco analytics", 1520, 990), new("content insights", 970, 640)],
            [AnalyticsDimension.UtmContent] = [new("hero-cta", 2830, 1790), new("feature-card", 1960, 1280), new("footer-link", 880, 570)]
        };

    private static readonly AnalyticsEventRow[] Events =
    [
        new("Signup completed", 1840, 1510),
        new("Demo requested", 920, 810),
        new("Newsletter subscribed", 760, 690),
        new("Resource downloaded", 540, 470)
    ];

    private static readonly AnalyticsFlagRow[] FlagKeys =
    [
        new("new-pricing-page", 10420, 6380),
        new("checkout-redesign", 7890, 4910),
        new("personalised-homepage", 4760, 3010)
    ];

    public Task<string> GetProjectNameAsync(VercelAnalyticsConnection connection, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(connection.DisplayName);
    }

    public Task<AnalyticsTotals> CountAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var scale = QueryScale(query);
        return Task.FromResult(new AnalyticsTotals(Scale(29430, scale), Scale(17260, scale)));
    }

    public Task<long> GetPageViewTotalAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(Scale(29430, QueryScale(query)));
    }

    public Task<IReadOnlyList<AnalyticsPoint>> GetTrendAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var timestamps = Timestamps(query).ToArray();
        var scale = QueryScale(query);
        var points = timestamps.Select((timestamp, index) =>
        {
            var wave = 0.78 + (index % 7 * 0.055) + (index % 3 * 0.025);
            return new AnalyticsPoint(timestamp, Scale(980, scale * wave), Scale(570, scale * wave));
        }).ToArray();
        return Task.FromResult<IReadOnlyList<AnalyticsPoint>>(points);
    }

    public Task<IReadOnlyList<AnalyticsBreakdownRow>> GetBreakdownAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var scenario = Scenario(connection);
        var isUtm = dimension is AnalyticsDimension.UtmSource or AnalyticsDimension.UtmMedium or AnalyticsDimension.UtmCampaign or AnalyticsDimension.UtmTerm or AnalyticsDimension.UtmContent;
        IReadOnlyList<AnalyticsBreakdownRow> rows = isUtm && scenario is not (MockAnalyticsScenario.Complete or MockAnalyticsScenario.Utm)
            ? []
            : Breakdowns.GetValueOrDefault(dimension, []);
        return Task.FromResult<IReadOnlyList<AnalyticsBreakdownRow>>(Filter(rows, search, limit, row => row.Value));
    }

    public Task<AnalyticsEventTotals> CountEventsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!HasEvents(connection)) return Task.FromResult(new AnalyticsEventTotals(0, 0));
        var row = Events.FirstOrDefault(item => string.Equals(item.EventName, eventName, StringComparison.OrdinalIgnoreCase));
        var scale = eventDataFilter is null ? 1d : 0.42d;
        return Task.FromResult(row is null
            ? new AnalyticsEventTotals(0, 0)
            : new AnalyticsEventTotals(Scale(row.Count, scale), Scale(row.Visitors, scale)));
    }

    public Task<IReadOnlyList<AnalyticsEventRow>> GetEventsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        int limit,
        string? search,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        IReadOnlyList<AnalyticsEventRow> rows = HasEvents(connection) ? Events : [];
        return Task.FromResult<IReadOnlyList<AnalyticsEventRow>>(Filter(rows, search, limit, row => row.EventName));
    }

    public Task<IReadOnlyList<AnalyticsFlagRow>> GetFlagsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string? flagKey,
        int limit,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!HasFlags(connection)) return Task.FromResult<IReadOnlyList<AnalyticsFlagRow>>([]);
        IReadOnlyList<AnalyticsFlagRow> rows = flagKey switch
        {
            "new-pricing-page" => [new("control", 5420, 3310), new("compact", 3180, 1960), new("editorial", 1820, 1110)],
            "checkout-redesign" => [new("disabled", 4110, 2540), new("enabled", 3780, 2370)],
            "personalised-homepage" => [new("default", 2410, 1530), new("industry", 1390, 870), new("returning-visitor", 960, 610)],
            _ => FlagKeys
        };
        return Task.FromResult<IReadOnlyList<AnalyticsFlagRow>>(rows.Take(Math.Max(0, limit)).ToArray());
    }

    public Task<IReadOnlyList<string>> GetEventPropertyNamesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        IReadOnlyList<string> properties = !HasEvents(connection) ? [] : eventName switch
        {
            "Signup completed" => ["plan", "source"],
            "Demo requested" => ["companySize", "industry"],
            "Resource downloaded" => ["resourceType"],
            _ => ["source"]
        };
        return Task.FromResult(properties);
    }

    public Task<IReadOnlyList<AnalyticsEventPropertyValue>> GetEventPropertyValuesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        string propertyName,
        int limit,
        string? search,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        AnalyticsEventPropertyValue[] values = propertyName switch
        {
            "plan" => [new("Pro", 820, 690), new("Starter", 610, 520), new("Enterprise", 410, 300)],
            "companySize" => [new("51-200", 380, 340), new("11-50", 290, 260), new("201-1000", 170, 150)],
            "industry" => [new("Technology", 360, 320), new("Retail", 220, 190), new("Financial services", 140, 120)],
            "resourceType" => [new("Guide", 280, 240), new("Template", 170, 150), new("Report", 90, 80)],
            _ => [new("Website", 740, 620), new("Campaign", 430, 370), new("Partner", 210, 180)]
        };
        IReadOnlyList<AnalyticsEventPropertyValue> rows = HasEvents(connection) ? values : [];
        return Task.FromResult<IReadOnlyList<AnalyticsEventPropertyValue>>(Filter(rows, search, limit, row => row.Value));
    }

    private static bool HasEvents(VercelAnalyticsConnection connection) =>
        Scenario(connection) is MockAnalyticsScenario.Complete or MockAnalyticsScenario.Events;

    private static bool HasFlags(VercelAnalyticsConnection connection) =>
        Scenario(connection) is MockAnalyticsScenario.Complete or MockAnalyticsScenario.Flags;

    private static MockAnalyticsScenario Scenario(VercelAnalyticsConnection connection) =>
        connection.MockScenario ?? throw new InvalidOperationException("A mock analytics client requires a mock connection.");

    private static T[] Filter<T>(IEnumerable<T> rows, string? search, int limit, Func<T, string> value)
    {
        var filtered = string.IsNullOrWhiteSpace(search)
            ? rows
            : rows.Where(row => value(row).Contains(search.Trim(), StringComparison.OrdinalIgnoreCase));
        return filtered.Take(Math.Max(0, limit)).ToArray();
    }

    private static double QueryScale(AnalyticsQuery query)
    {
        var scale = string.IsNullOrWhiteSpace(query.RequestPath) ? 1d : 0.36d;
        var rangeScale = Math.Clamp((query.To - query.From).TotalDays / 30d, 0.03d, 24d);
        return scale * rangeScale * Math.Pow(0.62d, query.Filters?.Count ?? 0);
    }

    private static long Scale(long value, double scale) => Math.Max(0, (long)Math.Round(value * scale));

    private static IEnumerable<DateTimeOffset> Timestamps(AnalyticsQuery query)
    {
        var current = query.From;
        var intervalCount = query.Interval switch
        {
            AnalyticsInterval.Hour => (query.To - query.From).TotalHours,
            AnalyticsInterval.Day => (query.To - query.From).TotalDays,
            AnalyticsInterval.Week => (query.To - query.From).TotalDays / 7d,
            AnalyticsInterval.Month => (query.To - query.From).TotalDays / 30d,
            _ => (query.To - query.From).TotalDays
        };
        var stride = Math.Max(1, (int)Math.Ceiling(intervalCount / 60d));
        while (current < query.To)
        {
            yield return current;
            current = query.Interval switch
            {
                AnalyticsInterval.Hour => current.AddHours(stride),
                AnalyticsInterval.Day => current.AddDays(stride),
                AnalyticsInterval.Week => current.AddDays(stride * 7),
                AnalyticsInterval.Month => current.AddMonths(stride),
                _ => current.AddDays(stride)
            };
        }
    }

}
