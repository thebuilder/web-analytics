using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Providers;

namespace TheBuilder.WebAnalytics.Services;

public sealed class PlausibleAnalyticsClient(
    HttpClient httpClient,
    AnalyticsProviderRequestGate requestGate) : IAnalyticsProviderClient, IAnalyticsEventsProviderClient, IAnalyticsEventPropertyDiscoveryProviderClient
{
    private const string QueryPath = "api/v2/query";

    public AnalyticsProviderDefinition Definition => PlausibleProvider.Definition;

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
        var response = await QueryAsync(
            connection,
            query,
            ["pageviews", "visitors"],
            [dimension],
            null,
            null,
            cancellationToken,
            includeTimeLabels: true);
        var labels = response.Meta?.TimeLabels
            ?? throw new JsonException("Plausible response did not contain requested time labels.");
        if (labels.Any(string.IsNullOrWhiteSpace) || labels.Distinct(StringComparer.Ordinal).Count() != labels.Count)
            throw new JsonException("Plausible returned invalid or duplicate time labels.");
        if (response.Results!
            .GroupBy(row => Dimension(row, 0, dimension), StringComparer.Ordinal)
            .Any(group => group.Count() > 1))
            throw new JsonException("Plausible returned duplicate time buckets.");
        var rows = response.Results!.ToDictionary(row => Dimension(row, 0, dimension), StringComparer.Ordinal);
        if (rows.Keys.Except(labels, StringComparer.Ordinal).Any())
            throw new JsonException("Plausible returned a time bucket outside the requested labels.");
        return labels.Select(label => rows.TryGetValue(label, out var row)
            ? new AnalyticsPoint(NormalizeTimeLabel(label), Metric(row, 0, "pageviews"), Metric(row, 1, "visitors"))
            : new AnalyticsPoint(NormalizeTimeLabel(label), 0, 0)).ToArray();
    }

    public async Task<IReadOnlyList<AnalyticsBreakdownRow>> GetBreakdownAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken,
        AnalyticsTrafficMetric? orderBy = null)
    {
        var plausibleDimension = ToApiDimension(dimension);
        var response = await QueryAsync(
            connection,
            query,
            ["pageviews", "visitors"],
            [plausibleDimension],
            limit,
            string.IsNullOrWhiteSpace(search) ? null : (plausibleDimension, search.Trim()),
            cancellationToken,
            orderBy: orderBy switch
            {
                AnalyticsTrafficMetric.PageViews => "pageviews",
                AnalyticsTrafficMetric.Visitors => "visitors",
                null => "visitors",
                _ => throw new ArgumentOutOfRangeException(nameof(orderBy))
            });
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

    public async Task<AnalyticsEventTotals> CountEventsAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        CancellationToken cancellationToken)
    {
        var response = await QueryAsync(
            connection,
            query,
            ["events", "visitors"],
            [],
            null,
            null,
            cancellationToken,
            eventName: eventName);
        var row = SingleRow(response);
        return new AnalyticsEventTotals(Metric(row, 0, "events"), Metric(row, 1, "visitors"));
    }

    public async Task<AnalyticsEventTotals> CountFilteredEventsAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter eventDataFilter,
        CancellationToken cancellationToken)
    {
        if (!SupportsEventProperty(connection, eventName, eventDataFilter.Property)) return new(0, 0);
        var response = await QueryAsync(
            connection,
            query,
            ["events", "visitors"],
            [],
            null,
            null,
            cancellationToken,
            eventName,
            eventDataFilter: eventDataFilter);
        var row = SingleRow(response);
        return new AnalyticsEventTotals(Metric(row, 0, "events"), Metric(row, 1, "visitors"));
    }

    public Task<IReadOnlyList<string>> GetEventPropertyNamesAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken) => Task.FromResult(EventPropertyNames(connection, eventName));

    public async Task<IReadOnlyDictionary<string, IReadOnlyList<AnalyticsEventProperty>>> DiscoverEventPropertiesAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        var propertyNames = connection.EventPropertyNames
            .Concat(["url", "path"])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var discoveries = await Task.WhenAll(propertyNames.Select(async propertyName =>
        {
            var propertyDimension = PropertyDimension(propertyName);
            var response = await QueryAsync(
                connection,
                query,
                ["events", "visitors"],
                ["event:goal", propertyDimension],
                null,
                null,
                cancellationToken,
                eventDataFilter: eventDataFilter);
            var propertiesByEvent = response.Results!
                .Where(HasPropertyValue)
                .Select(row => (Row: row, EventName: Dimension(row, 0, "event:goal")))
                .Where(item => SupportsEventProperty(connection, item.EventName, propertyName))
                .GroupBy(item => item.EventName, StringComparer.Ordinal)
                .ToDictionary(
                    group => group.Key,
                    group => new AnalyticsEventProperty(
                        propertyName,
                        group.Select(item => new AnalyticsEventPropertyValue(
                            Dimension(item.Row, 1, propertyDimension),
                            Metric(item.Row, 0, "events"),
                            Metric(item.Row, 1, "visitors"))).ToArray()),
                    StringComparer.Ordinal);
            return propertiesByEvent;
        }));

        return discoveries
            .SelectMany(discovery => discovery.Select(item => (EventName: item.Key, Property: item.Value)))
            .GroupBy(item => item.EventName, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<AnalyticsEventProperty>)group.Select(item => item.Property).ToArray(),
                StringComparer.Ordinal);
    }

    public async Task<IReadOnlyList<AnalyticsEventPropertyValue>> GetEventPropertyValuesAsync(
        AnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        string propertyName,
        int limit,
        string? search,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        if (!SupportsEventProperty(connection, eventName, propertyName)) return [];
        var dimension = PropertyDimension(propertyName);
        var response = await QueryAsync(
            connection,
            query,
            ["events", "visitors"],
            [dimension],
            limit,
            string.IsNullOrWhiteSpace(search) ? null : (dimension, search.Trim()),
            cancellationToken,
            eventName,
            orderBy: "events",
            eventDataFilter: eventDataFilter);
        return response.Results!.Select(row => new AnalyticsEventPropertyValue(
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
        string? eventName = null,
        bool includeTimeLabels = false,
        string? orderBy = null,
        AnalyticsEventDataFilter? eventDataFilter = null)
    {
        var filters = BuildFilters(query, eventName, eventDataFilter);
        if (search is { } searchFilter)
        {
            filters.Add(new PlausibleFilter("contains", searchFilter.Dimension, [searchFilter.Value]));
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
            limit is null ? null : new PlausiblePagination(Math.Min(limit.Value, 100), 0),
            includeTimeLabels ? new PlausibleInclude(TimeLabels: true) : null,
            orderBy is null ? null : [[orderBy, "desc"]]);

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
        if (payload is not { Results: not null })
            throw new JsonException("Plausible response did not contain results.");
        if (payload.Results.Any(row =>
            row.Dimensions?.Count != dimensions.Length || row.Metrics?.Count != metrics.Length))
            throw new JsonException("Plausible response row did not match the requested shape.");
        return payload;
    }

    private static List<PlausibleFilter> BuildFilters(
        AnalyticsQuery query,
        string? eventName,
        AnalyticsEventDataFilter? eventDataFilter)
    {
        var filters = new List<PlausibleFilter>();
        if (!string.IsNullOrWhiteSpace(query.RequestPath))
        {
            filters.Add(new PlausibleFilter("is", "event:page", [query.RequestPath]));
        }
        foreach (var filter in query.Filters ?? [])
        {
            filters.Add(new PlausibleFilter("is", ToApiDimension(filter.Dimension), [filter.Value]));
        }
        if (!string.IsNullOrWhiteSpace(eventName) &&
            query.Filters?.Any(filter =>
                filter.Dimension == AnalyticsDimension.EventName &&
                string.Equals(filter.Value, eventName, StringComparison.Ordinal)) is not true)
        {
            filters.Add(new PlausibleFilter("is", "event:goal", [eventName]));
        }
        if (eventDataFilter is not null)
        {
            filters.Add(new PlausibleFilter("is", PropertyDimension(eventDataFilter.Property), [eventDataFilter.Value]));
        }
        return filters;
    }

    private static IReadOnlyList<string> EventPropertyNames(AnalyticsConnection connection, string eventName)
    {
        var builtIn = eventName switch
        {
            "Outbound Link: Click" or "File Download" => "url",
            "404" => "path",
            _ => null
        };
        return (builtIn is null ? connection.EventPropertyNames : [builtIn, .. connection.EventPropertyNames])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static bool SupportsEventProperty(AnalyticsConnection connection, string eventName, string propertyName) =>
        EventPropertyNames(connection, eventName).Contains(propertyName.Trim(), StringComparer.OrdinalIgnoreCase);

    private static string PropertyDimension(string propertyName) => $"event:props:{propertyName.Trim()}";

    private static bool HasPropertyValue(PlausibleRow row) =>
        row.Dimensions is not null &&
        row.Dimensions.Count > 1 &&
        row.Dimensions[1] is { Length: > 0 } value &&
        !string.Equals(value, "(none)", StringComparison.OrdinalIgnoreCase);

    internal static string ToApiDimension(AnalyticsDimension dimension) => dimension switch
    {
        AnalyticsDimension.RequestPath => "event:page",
        AnalyticsDimension.Referrer => "visit:referrer",
        AnalyticsDimension.Country => "visit:country",
        AnalyticsDimension.DeviceType => "visit:device",
        AnalyticsDimension.BrowserName => "visit:browser",
        AnalyticsDimension.OsName => "visit:os",
        AnalyticsDimension.UtmSource => "visit:utm_source",
        AnalyticsDimension.UtmMedium => "visit:utm_medium",
        AnalyticsDimension.UtmCampaign => "visit:utm_campaign",
        AnalyticsDimension.UtmTerm => "visit:utm_term",
        AnalyticsDimension.UtmContent => "visit:utm_content",
        AnalyticsDimension.EventName => "event:goal",
        _ => throw new ArgumentOutOfRangeException(nameof(dimension), dimension, "Plausible does not support this dimension.")
    };

    private static PlausibleRow SingleRow(PlausibleResponse response) => response.Results!.Count switch
    {
        0 => new PlausibleRow([], [JsonSerializer.SerializeToElement(0), JsonSerializer.SerializeToElement(0)]),
        1 => response.Results![0],
        _ => throw new JsonException("Plausible aggregate response contained multiple rows.")
    };

    private static long Metric(PlausibleRow row, int index, string name) =>
        row.Metrics is not null && index < row.Metrics.Count && row.Metrics[index].TryGetInt64(out var value)
            ? value
            : throw new JsonException($"Plausible metric '{name}' was missing or invalid.");

    private static string Dimension(PlausibleRow row, int index, string name) =>
        row.Dimensions is not null && index < row.Dimensions.Count && !string.IsNullOrWhiteSpace(row.Dimensions[index])
            ? row.Dimensions[index]
            : throw new JsonException($"Plausible dimension '{name}' was missing or invalid.");

    private static string NormalizeTimeLabel(string value)
    {
        if (DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (DateTime.TryParseExact(
            value,
            ["yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss"],
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var localTime))
            return localTime.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var timestamp))
            return timestamp.ToString("O", CultureInfo.InvariantCulture);
        throw new JsonException("Plausible returned an invalid time dimension.");
    }

    private sealed record PlausibleRequest(
        [property: JsonPropertyName("site_id")] string SiteId,
        [property: JsonPropertyName("metrics")] string[] Metrics,
        [property: JsonPropertyName("date_range")] string[] DateRange,
        [property: JsonPropertyName("dimensions")] string[] Dimensions,
        [property: JsonPropertyName("filters")] IReadOnlyList<PlausibleFilter> Filters,
        [property: JsonPropertyName("pagination"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PlausiblePagination? Pagination,
        [property: JsonPropertyName("include"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PlausibleInclude? Include,
        [property: JsonPropertyName("order_by"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string[][]? OrderBy);

    private sealed record PlausiblePagination(
        [property: JsonPropertyName("limit")] int Limit,
        [property: JsonPropertyName("offset")] int Offset);

    private sealed record PlausibleInclude(
        [property: JsonPropertyName("time_labels")] bool TimeLabels);

    private sealed record PlausibleResponse(
        [property: JsonPropertyName("results")] IReadOnlyList<PlausibleRow>? Results,
        [property: JsonPropertyName("meta")] PlausibleMeta? Meta);

    private sealed record PlausibleMeta(
        [property: JsonPropertyName("time_labels")] IReadOnlyList<string>? TimeLabels);

    private sealed record PlausibleRow(
        [property: JsonPropertyName("dimensions")] IReadOnlyList<string>? Dimensions,
        [property: JsonPropertyName("metrics")] IReadOnlyList<JsonElement>? Metrics);

    [JsonConverter(typeof(PlausibleFilterJsonConverter))]
    private sealed record PlausibleFilter(string Operator, string Dimension, IReadOnlyList<string> Values);

    private sealed class PlausibleFilterJsonConverter : JsonConverter<PlausibleFilter>
    {
        public override PlausibleFilter Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            throw new NotSupportedException("Plausible filters are request-only values.");

        public override void Write(Utf8JsonWriter writer, PlausibleFilter value, JsonSerializerOptions options)
        {
            writer.WriteStartArray();
            writer.WriteStringValue(value.Operator);
            writer.WriteStringValue(value.Dimension);
            JsonSerializer.Serialize(writer, value.Values, options);
            writer.WriteEndArray();
        }
    }
}
