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

    public async Task<string> GetProjectNameAsync(
        VercelAnalyticsConnection connection,
        CancellationToken cancellationToken)
    {
        var parameters = new Dictionary<string, string?>();
        AddTeamScope(parameters, connection.Team);

        var path = $"v9/projects/{Uri.EscapeDataString(connection.ProjectId)}";
        using var response = await SendAsync(connection, path, parameters, cancellationToken);
        var project = await response.Content.ReadFromJsonAsync<ProjectResponse>(cancellationToken);
        return !string.IsNullOrWhiteSpace(project?.Name)
            ? project.Name
            : throw new JsonException("Vercel project response did not contain a name.");
    }

    public async Task<AnalyticsTotals> CountAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        using var response = await SendAsync(
            connection,
            CountPath,
            BuildVisitParameters(connection, query),
            cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<CountEnvelope>(cancellationToken);
        return envelope?.Data is null
            ? throw new JsonException("Vercel Analytics count response did not contain data.")
            : new AnalyticsTotals(envelope.Data.PageViews, envelope.Data.Visitors);
    }

    public async Task<long> GetPageViewTotalAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var parameters = BuildVisitParameters(connection, query);
        parameters["by"] = "requestPath";
        parameters["limit"] = "100";
        using var response = await SendAsync(connection, AggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        // `Others` is intentionally included here: it is Vercel's remainder bucket and
        // makes this partition reconcile with the exact page-view total for the range.
        return envelope?.Data.Sum(item => GetInt64(item, "pageviews"))
            ?? throw new JsonException("Vercel Analytics aggregate response did not contain data.");
    }

    public async Task<IReadOnlyList<AnalyticsPoint>> GetTrendAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var parameters = BuildVisitParameters(connection, query);
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
        var parameters = BuildVisitParameters(connection, query);
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
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        var parameters = BuildEventParameters(connection, query);
        AddFilter(parameters, $"eventName eq '{EscapeODataString(eventName)}'");
        AddEventDataFilter(parameters, eventDataFilter);
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
        var parameters = BuildEventParameters(connection, query);
        parameters["by"] = "eventName";
        parameters["limit"] = limit.ToString(CultureInfo.InvariantCulture);
        foreach (var filter in query.Filters?.Where(filter => filter.Dimension == AnalyticsDimension.EventName) ?? [])
        {
            AddFilter(parameters, $"eventName eq '{EscapeODataString(filter.Value)}'");
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            AddFilter(parameters, $"contains(eventName, '{EscapeODataString(search.Trim())}')");
        }

        using var response = await SendAsync(connection, EventAggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        return envelope?.Data.Select(ParseEvent).ToArray()
            ?? throw new JsonException("Vercel Analytics event response did not contain data.");
    }

    public async Task<IReadOnlyList<AnalyticsFlagRow>> GetFlagsAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string? flagKey,
        int limit,
        CancellationToken cancellationToken)
    {
        var dimension = string.IsNullOrWhiteSpace(flagKey) ? "flags" : ToFlagDimension(flagKey.Trim());
        var parameters = BuildVisitParameters(connection, query);
        parameters["by"] = dimension;
        parameters["limit"] = limit.ToString(CultureInfo.InvariantCulture);
        using var response = await SendAsync(connection, AggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        return envelope?.Data
            .Select(item => ParseFlag(item, dimension, flagKey))
            .Where(row => row.Value is not "Others")
            .ToArray()
            ?? throw new JsonException("Vercel Analytics flags response did not contain data.");
    }

    public async Task<IReadOnlyList<string>> GetEventPropertyNamesAsync(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query,
        string eventName,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        var parameters = BuildEventParameters(connection, query);
        parameters["by"] = "eventData";
        parameters["limit"] = EventPropertyLimit.ToString(CultureInfo.InvariantCulture);
        AddFilter(parameters, $"eventName eq '{EscapeODataString(eventName)}'");
        AddEventDataFilter(parameters, eventDataFilter);
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
        string? search,
        AnalyticsEventDataFilter? eventDataFilter,
        CancellationToken cancellationToken)
    {
        var dimension = ToEventDataDimension(propertyName);
        var parameters = BuildEventParameters(connection, query);
        parameters["by"] = dimension;
        parameters["limit"] = limit.ToString(CultureInfo.InvariantCulture);
        AddFilter(parameters, $"eventName eq '{EscapeODataString(eventName)}'");
        AddEventDataFilter(parameters, eventDataFilter);
        if (!string.IsNullOrWhiteSpace(search))
        {
            AddFilter(parameters, $"contains({dimension}, '{EscapeODataString(search.Trim())}')");
        }
        using var response = await SendAsync(connection, EventAggregatePath, parameters, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<AggregateEnvelope>(cancellationToken);
        return envelope?.Data
            .Select(item => ParseEventPropertyValue(item, propertyName))
            .Where(value => value.Value is not "Others")
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

    private static Dictionary<string, string?> BuildVisitParameters(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query)
    {
        if (query.Filters?.Any(filter => filter.Dimension == AnalyticsDimension.EventName) is true)
        {
            throw new ArgumentException("EventName filters are only valid for event reports.", nameof(query));
        }

        return BuildEventParameters(connection, query);
    }

    private static Dictionary<string, string?> BuildEventParameters(
        VercelAnalyticsConnection connection,
        AnalyticsQuery query)
    {
        var parameters = new Dictionary<string, string?>
        {
            ["projectId"] = connection.ProjectId,
            ["since"] = query.From.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            // Vercel's `until` value is inclusive. AnalyticsQuery.To is exclusive so
            // calendar ranges remain exact across time zones and DST transitions.
            ["until"] = query.To.AddMilliseconds(-1).ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)
        };
        AddTeamScope(parameters, connection.Team);
        if (query.RequestPath is not null)
        {
            parameters["filter"] = $"requestPath eq '{EscapeODataString(query.RequestPath)}'";
        }
        foreach (var filter in query.Filters?.Where(filter => filter.Dimension != AnalyticsDimension.EventName) ?? [])
        {
            AddFilter(parameters, $"{ToApiValue(filter.Dimension)} eq '{EscapeODataString(filter.Value)}'");
        }

        return parameters;
    }

    private static void AddTeamScope(IDictionary<string, string?> parameters, string? team)
    {
        if (team is null) return;
        parameters[team.StartsWith("team_", StringComparison.Ordinal) ? "teamId" : "slug"] = team;
    }

    internal static string EscapeODataString(string value) => value.Replace("'", "''", StringComparison.Ordinal);

    internal static string ToEventDataDimension(string propertyName) =>
        propertyName.All(character => char.IsAsciiLetterOrDigit(character) || character == '_')
            ? $"eventData/{propertyName}"
            : $"eventData/'{EscapeODataString(propertyName)}'";

    internal static string ToFlagDimension(string flagKey) =>
        flagKey.All(character => char.IsAsciiLetterOrDigit(character) || character == '_')
            ? $"flags/{flagKey}"
            : $"flags/'{EscapeODataString(flagKey)}'";

    private static void AddFilter(IDictionary<string, string?> parameters, string filter) =>
        parameters["filter"] = parameters.TryGetValue("filter", out var existingFilter)
            ? $"{existingFilter} and {filter}"
            : filter;

    private static void AddEventDataFilter(
        IDictionary<string, string?> parameters,
        AnalyticsEventDataFilter? filter)
    {
        if (filter is null) return;
        AddFilter(parameters,
            $"{ToEventDataDimension(filter.Property)} eq '{EscapeODataString(filter.Value)}'");
    }

    internal static string ToApiValue(AnalyticsInterval interval) => interval switch
    {
        AnalyticsInterval.Hour => "hour",
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
        AnalyticsDimension.UtmTerm => "utmTerm",
        AnalyticsDimension.UtmContent => "utmContent",
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

    private static AnalyticsFlagRow ParseFlag(JsonElement element, string dimension, string? flagKey)
    {
        var unquotedDimension = flagKey is null ? dimension : $"flags/{flagKey}";
        var value = element.TryGetProperty(dimension, out var exactValue)
            ? exactValue
            : element.TryGetProperty(unquotedDimension, out var unquotedValue)
                ? unquotedValue
                : element.TryGetProperty(flagKey is null ? "flags" : flagKey, out var shortValue)
                    ? shortValue
                    : default;
        return new AnalyticsFlagRow(
            value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ? "Unknown" : value.ToString(),
            GetInt64(element, "pageviews"),
            GetInt64(element, "visitors"));
    }

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

    private sealed record ProjectResponse(string Name);
}
