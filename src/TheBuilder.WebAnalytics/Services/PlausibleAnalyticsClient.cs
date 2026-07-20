using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public sealed class PlausibleAnalyticsClient(
    HttpClient httpClient,
    AnalyticsProviderRequestGate requestGate) : IAnalyticsProviderClient, IAnalyticsEventsProviderClient
{
    private const string QueryPath = "api/v2/query";

    public AnalyticsProvider Provider => AnalyticsProvider.Plausible;

    public AnalyticsCapabilities Capabilities => AnalyticsProviderCatalog.Default.Get(Provider).Capabilities;

    public Task<string> GetDisplayNameAsync(
        AnalyticsConnection connection,
        CancellationToken cancellationToken) => Task.FromResult(connection.SiteId);

    public Task<AnalyticsTotals> GetTotalsAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken) => CountAsync(connection, query, cancellationToken);

    public async Task<AnalyticsTotals> CountAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var response = await QueryAsync(connection, query, ["pageviews", "visitors"], [], null, null, cancellationToken);
        var row = SingleRow(response);
        return new AnalyticsTotals(Metric(row, 0, "pageviews"), Metric(row, 1, "visitors"));
    }

    public async Task<IReadOnlyList<AnalyticsPoint>> GetTrendAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var dimension = query.Interval switch
        {
            AnalyticsInterval.Hour => "time:hour",
            AnalyticsInterval.Day => "time:day",
            AnalyticsInterval.Week => "time:week",
            AnalyticsInterval.Month => "time:month",
            _ => throw new ArgumentOutOfRangeException(nameof(query))
        };
        var response = await QueryAsync(connection, query, ["pageviews", "visitors"], [dimension], null, null, cancellationToken);
        return response.Results!.Select(row => new AnalyticsPoint(
            ParseTimestamp(Dimension(row, 0, dimension)),
            Metric(row, 0, "pageviews"),
            Metric(row, 1, "visitors"))).ToArray();
    }

    public async Task<IReadOnlyList<AnalyticsBreakdownRow>> GetBreakdownAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken)
    {
        var plausibleDimension = ToApiDimension(dimension);
        var response = await QueryAsync(
            connection,
            query,
            ["pageviews", "visitors"],
            [plausibleDimension],
            limit,
            string.IsNullOrWhiteSpace(search) ? null : (plausibleDimension, search.Trim()),
            cancellationToken);
        return response.Results!.Select(row => new AnalyticsBreakdownRow(
            Dimension(row, 0, plausibleDimension),
            Metric(row, 0, "pageviews"),
            Metric(row, 1, "visitors"))).ToArray();
    }

    public async Task<IReadOnlyList<AnalyticsEventRow>> GetEventsAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        int limit,
        string? search,
        CancellationToken cancellationToken)
    {
        const string dimension = "event:goal";
        var response = await QueryAsync(
            connection,
            query,
            ["events", "visitors"],
            [dimension],
            limit,
            string.IsNullOrWhiteSpace(search) ? null : (dimension, search.Trim()),
            cancellationToken);
        return response.Results!.Select(row => new AnalyticsEventRow(
            Dimension(row, 0, dimension),
            Metric(row, 0, "events"),
            Metric(row, 1, "visitors"))).ToArray();
    }

    private async Task<PlausibleResponse> QueryAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string[] metrics,
        string[] dimensions,
        int? limit,
        (string Dimension, string Value)? search,
        CancellationToken cancellationToken,
        string? eventName = null)
    {
        var filters = BuildFilters(query, eventName);
        if (search is { } searchFilter)
        {
            filters.Add(["contains", searchFilter.Dimension, new[] { searchFilter.Value }]);
        }

        var requestBody = new PlausibleRequest(
            connection.SiteId,
            metrics,
            [
                query.From.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
                query.To.AddTicks(-1).ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)
            ],
            dimensions,
            filters,
            limit is null ? null : new PlausiblePagination(Math.Min(limit.Value, 100), 0));

        using var request = new HttpRequestMessage(HttpMethod.Post, QueryPath)
        {
            Content = JsonContent.Create(requestBody)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", connection.AccessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await requestGate.RunAsync(
            operationToken => httpClient.SendAsync(request, HttpCompletionOption.ResponseContentRead, operationToken),
            cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new AnalyticsProviderApiException(response.StatusCode, AnalyticsProvider.Plausible);
        }

        var payload = await response.Content.ReadFromJsonAsync<PlausibleResponse>(cancellationToken);
        return payload is { Results: not null }
            ? payload
            : throw new JsonException("Plausible response did not contain results.");
    }

    private static List<object[]> BuildFilters(AnalyticsQuery query, string? eventName)
    {
        var filters = new List<object[]>();
        if (!string.IsNullOrWhiteSpace(query.RequestPath))
        {
            filters.Add(["is", "event:page", new[] { query.RequestPath }]);
        }
        foreach (var filter in query.Filters ?? [])
        {
            filters.Add(["is", ToApiDimension(filter.Dimension), new[] { filter.Value }]);
        }
        if (!string.IsNullOrWhiteSpace(eventName))
        {
            filters.Add(["is", "event:goal", new[] { eventName }]);
        }
        return filters;
    }

    internal static string ToApiDimension(AnalyticsDimension dimension) => dimension switch
    {
        AnalyticsDimension.RequestPath or AnalyticsDimension.Route => "event:page",
        AnalyticsDimension.ReferrerHostname => "visit:referrer",
        AnalyticsDimension.Country => "visit:country_name",
        AnalyticsDimension.DeviceType => "visit:device",
        AnalyticsDimension.BrowserName => "visit:browser",
        AnalyticsDimension.OsName => "visit:os",
        AnalyticsDimension.UtmSource => "visit:utm_source",
        AnalyticsDimension.UtmMedium => "visit:utm_medium",
        AnalyticsDimension.UtmCampaign => "visit:utm_campaign",
        AnalyticsDimension.EventName => "event:goal",
        _ => throw new ArgumentOutOfRangeException(nameof(dimension), dimension, "Plausible does not support this dimension.")
    };

    private static PlausibleRow SingleRow(PlausibleResponse response) => response.Results!.Count switch
    {
        0 => new PlausibleRow([], [JsonSerializer.SerializeToElement(0), JsonSerializer.SerializeToElement(0)]),
        _ => response.Results![0]
    };

    private static long Metric(PlausibleRow row, int index, string name) =>
        row.Metrics is not null && index < row.Metrics.Count && row.Metrics[index].TryGetInt64(out var value)
            ? value
            : throw new JsonException($"Plausible metric '{name}' was missing or invalid.");

    private static string Dimension(PlausibleRow row, int index, string name) =>
        row.Dimensions is not null && index < row.Dimensions.Count && !string.IsNullOrWhiteSpace(row.Dimensions[index])
            ? row.Dimensions[index]
            : throw new JsonException($"Plausible dimension '{name}' was missing or invalid.");

    private static DateTimeOffset ParseTimestamp(string value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var timestamp)
            ? timestamp
            : throw new JsonException("Plausible returned an invalid time dimension.");

    private sealed record PlausibleRequest(
        [property: JsonPropertyName("site_id")] string SiteId,
        [property: JsonPropertyName("metrics")] string[] Metrics,
        [property: JsonPropertyName("date_range")] string[] DateRange,
        [property: JsonPropertyName("dimensions")] string[] Dimensions,
        [property: JsonPropertyName("filters")] IReadOnlyList<object[]> Filters,
        [property: JsonPropertyName("pagination"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PlausiblePagination? Pagination);

    private sealed record PlausiblePagination(
        [property: JsonPropertyName("limit")] int Limit,
        [property: JsonPropertyName("offset")] int Offset);

    private sealed record PlausibleResponse(
        [property: JsonPropertyName("results")] IReadOnlyList<PlausibleRow>? Results);

    private sealed record PlausibleRow(
        [property: JsonPropertyName("dimensions")] IReadOnlyList<string>? Dimensions,
        [property: JsonPropertyName("metrics")] IReadOnlyList<JsonElement>? Metrics);
}
