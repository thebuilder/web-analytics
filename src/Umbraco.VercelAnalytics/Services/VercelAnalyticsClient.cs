using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;

namespace Umbraco.VercelAnalytics.Services;

public sealed class VercelAnalyticsClient(HttpClient httpClient) : IVercelAnalyticsClient
{
    private const int EventPropertyLimit = 20;
    private const string CountPath = "v1/query/web-analytics/visits/count";
    private const string AggregatePath = "v1/query/web-analytics/visits/aggregate";
    private const string EventCountPath = "v1/query/web-analytics/events/count";
    private const string EventAggregatePath = "v1/query/web-analytics/events/aggregate";

    public async Task<AnalyticsTotals> CountAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        using var response = await SendAsync(
            connection,
            CountPath,
            BuildParameters(connection, query),
            cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<CountEnvelope>(cancellationToken);
        return envelope?.Data is null
            ? throw new JsonException("Vercel Analytics count response did not contain data.")
            : new AnalyticsTotals(envelope.Data.PageViews, envelope.Data.Visitors);
    }

    public async Task<IReadOnlyList<AnalyticsPoint>> GetTrendAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var parameters = BuildParameters(connection, query);
        parameters["by"] = ToApiValue(query.Interval);
        using var response = await SendAsync(connection, AggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        return envelope?.Data.Select(ParsePoint).ToArray()
            ?? throw new JsonException("Vercel Analytics aggregate response did not contain data.");
    }

    public async Task<IReadOnlyList<AnalyticsBreakdownRow>> GetBreakdownAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        AnalyticsDimension dimension,
        int limit,
        string? search,
        CancellationToken cancellationToken)
    {
        var apiDimension = ToApiValue(dimension);
        var parameters = BuildParameters(connection, query);
        parameters["by"] = apiDimension;
        parameters["limit"] = limit.ToString(CultureInfo.InvariantCulture);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchFilter = $"contains({apiDimension}, '{EscapeODataString(search.Trim())}')";
            AddFilter(parameters, searchFilter);
        }
        using var response = await SendAsync(connection, AggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        return envelope?.Data.Select(item => ParseBreakdown(item, apiDimension)).ToArray()
            ?? throw new JsonException("Vercel Analytics breakdown response did not contain data.");
    }

    public async Task<AnalyticsEventTotals> CountEventsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        CancellationToken cancellationToken)
    {
        var parameters = BuildParameters(connection, query);
        AddFilter(parameters, $"eventName eq '{EscapeODataString(eventName)}'");
        using var response = await SendAsync(connection, EventCountPath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<EventCountEnvelope>(cancellationToken);
        return envelope?.Data is null
            ? throw new JsonException("Vercel Analytics event count response did not contain data.")
            : new AnalyticsEventTotals(envelope.Data.Count, envelope.Data.Visitors);
    }

    public async Task<IReadOnlyList<AnalyticsEventRow>> GetEventsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        int limit,
        string? search,
        CancellationToken cancellationToken)
    {
        var parameters = BuildParameters(connection, query);
        parameters["by"] = "eventName";
        parameters["limit"] = limit.ToString(CultureInfo.InvariantCulture);
        if (!string.IsNullOrWhiteSpace(search))
        {
            AddFilter(parameters, $"contains(eventName, '{EscapeODataString(search.Trim())}')");
        }

        using var response = await SendAsync(connection, EventAggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        return envelope?.Data.Select(ParseEvent).ToArray()
            ?? throw new JsonException("Vercel Analytics event response did not contain data.");
    }

    public async Task<IReadOnlyList<string>> GetEventPropertyNamesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        CancellationToken cancellationToken)
    {
        var parameters = BuildParameters(connection, query);
        parameters["by"] = "eventData";
        parameters["limit"] = EventPropertyLimit.ToString(CultureInfo.InvariantCulture);
        AddFilter(parameters, $"eventName eq '{EscapeODataString(eventName)}'");
        using var response = await SendAsync(connection, EventAggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        return envelope?.Data
            .Select(item => item.TryGetProperty("eventData", out var property) ? property.ToString() : string.Empty)
            .Where(property => !string.IsNullOrWhiteSpace(property) && property is not "Others" and not "Unknown")
            .ToArray()
            ?? throw new JsonException("Vercel Analytics event property response did not contain data.");
    }

    public async Task<IReadOnlyList<AnalyticsEventPropertyValue>> GetEventPropertyValuesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        string propertyName,
        int limit,
        CancellationToken cancellationToken)
    {
        var parameters = BuildParameters(connection, query);
        parameters["by"] = ToEventDataDimension(propertyName);
        parameters["limit"] = limit.ToString(CultureInfo.InvariantCulture);
        AddFilter(parameters, $"eventName eq '{EscapeODataString(eventName)}'");
        using var response = await SendAsync(connection, EventAggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        return envelope?.Data
            .Select(item => ParseEventPropertyValue(item, propertyName))
            .Where(value => value.Value is not "Others" and not "Unknown")
            .ToArray()
            ?? throw new JsonException("Vercel Analytics event property values response did not contain data.");
    }

    private async Task<HttpResponseMessage> SendAsync(
        VercelAnalyticsConnection connection,
        string path,
        IDictionary<string, string?> parameters,
        CancellationToken cancellationToken)
    {
        var uri = QueryHelpers.AddQueryString(path, parameters);
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", connection.AccessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var statusCode = response.StatusCode;
            response.Dispose();
            throw new VercelAnalyticsApiException(statusCode);
        }

        return response;
    }

    private static Dictionary<string, string?> BuildParameters(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query)
    {
        var parameters = new Dictionary<string, string?>
        {
            ["projectId"] = connection.ProjectId,
            ["since"] = query.From.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["until"] = query.To.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
        };
        if (connection.TeamId is not null) parameters["teamId"] = connection.TeamId;
        if (connection.TeamSlug is not null) parameters["slug"] = connection.TeamSlug;
        if (query.RequestPath is not null)
        {
            parameters["filter"] = $"requestPath eq '{EscapeODataString(query.RequestPath)}'";
        }
        foreach (var filter in query.Filters ?? [])
        {
            AddFilter(parameters, $"{ToApiValue(filter.Dimension)} eq '{EscapeODataString(filter.Value)}'");
        }

        return parameters;
    }

    internal static string EscapeODataString(string value) => value.Replace("'", "''", StringComparison.Ordinal);

    internal static string ToEventDataDimension(string propertyName) =>
        propertyName.All(character => char.IsAsciiLetterOrDigit(character) || character == '_')
            ? $"eventData/{propertyName}"
            : $"eventData/'{EscapeODataString(propertyName)}'";

    private static void AddFilter(IDictionary<string, string?> parameters, string filter) =>
        parameters["filter"] = parameters.TryGetValue("filter", out var existingFilter)
            ? $"{existingFilter} and {filter}"
            : filter;

    internal static string ToApiValue(AnalyticsInterval interval) => interval switch
    {
        AnalyticsInterval.Day => "day",
        AnalyticsInterval.Week => "week",
        AnalyticsInterval.Month => "month",
        _ => throw new ArgumentOutOfRangeException(nameof(interval))
    };

    internal static string ToApiValue(AnalyticsDimension dimension) => dimension switch
    {
        AnalyticsDimension.RequestPath => "requestPath",
        AnalyticsDimension.Route => "route",
        AnalyticsDimension.ReferrerHostname => "referrerHostname",
        AnalyticsDimension.Country => "country",
        AnalyticsDimension.DeviceType => "deviceType",
        AnalyticsDimension.BrowserName => "browserName",
        AnalyticsDimension.OsName => "osName",
        AnalyticsDimension.UtmSource => "utmSource",
        AnalyticsDimension.UtmMedium => "utmMedium",
        AnalyticsDimension.UtmCampaign => "utmCampaign",
        _ => throw new ArgumentOutOfRangeException(nameof(dimension))
    };

    private static AnalyticsPoint ParsePoint(JsonElement element) => new(
        element.GetProperty("timestamp").GetDateTimeOffset(),
        GetInt64(element, "pageviews"),
        GetInt64(element, "visitors"));

    private static AnalyticsBreakdownRow ParseBreakdown(JsonElement element, string dimension) => new(
        element.TryGetProperty(dimension, out var value) ? value.ToString() : "Unknown",
        GetInt64(element, "pageviews"),
        GetInt64(element, "visitors"));

    private static AnalyticsEventRow ParseEvent(JsonElement element) => new(
        element.TryGetProperty("eventName", out var eventName) ? eventName.ToString() : "Unknown",
        GetInt64(element, "count"),
        GetInt64(element, "visitors"));

    private static AnalyticsEventPropertyValue ParseEventPropertyValue(JsonElement element, string propertyName)
    {
        var value = element.TryGetProperty(propertyName, out var namedValue)
            ? namedValue
            : element.TryGetProperty($"eventData/{propertyName}", out var qualifiedValue)
                ? qualifiedValue
                : element.TryGetProperty("eventData", out var eventDataValue)
                    ? eventDataValue
                    : default;
        return new AnalyticsEventPropertyValue(
            value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ? "Unknown" : value.ToString(),
            GetInt64(element, "count"),
            GetInt64(element, "visitors"));
    }

    private static long GetInt64(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetInt64(out var result) ? result : 0;

    private sealed record CountEnvelope(CountData Data);

    private sealed record CountData(
        [property: System.Text.Json.Serialization.JsonPropertyName("pageviews")] long PageViews,
        [property: System.Text.Json.Serialization.JsonPropertyName("visitors")] long Visitors);

    private sealed record EventCountEnvelope(EventCountData Data);

    private sealed record EventCountData(long Count, long Visitors);

    private sealed record AggregateEnvelope(JsonElement[] Data);
}
