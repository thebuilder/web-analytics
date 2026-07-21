using System.Net;
using System.Text;
using System.Text.Json;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class PlausibleAnalyticsClientTests
{
    [Fact]
    public async Task Count_posts_authenticated_v2_query_with_exclusive_end_adjusted()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":[],"metrics":[42,31]}]}""");
        var client = CreateClient(handler);

        var result = await client.CountAsync(CreateConnection(), CreateQuery(), CancellationToken.None);

        Assert.Equal(new AnalyticsTotals(42, 31), result);
        Assert.Equal(HttpMethod.Post, handler.Request?.Method);
        Assert.Equal("Bearer secret", handler.Request?.Headers.Authorization?.ToString());
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal("example.com", body.RootElement.GetProperty("site_id").GetString());
        Assert.Equal("2026-07-02T23:59:59.9999999+00:00", body.RootElement.GetProperty("date_range")[1].GetString());
    }

    [Fact]
    public async Task Count_applies_a_global_event_name_filter()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":[],"metrics":[15,12]}]}""");
        var client = CreateClient(handler);
        var query = CreateQuery() with
        {
            Filters = [new AnalyticsFilter(AnalyticsDimension.EventName, "Read case")]
        };

        var result = await client.CountAsync(CreateConnection(), query, CancellationToken.None);

        Assert.Equal(new AnalyticsTotals(15, 12), result);
        using var body = JsonDocument.Parse(handler.Body!);
        var filter = Assert.Single(body.RootElement.GetProperty("filters").EnumerateArray());
        Assert.Equal("is", filter[0].GetString());
        Assert.Equal("event:goal", filter[1].GetString());
        Assert.Equal("Read case", filter[2][0].GetString());
    }

    [Fact]
    public async Task Breakdown_maps_common_dimension_filters_and_search()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":["Google"],"metrics":[12,8]}]}""");
        var client = CreateClient(handler);
        var query = CreateQuery() with
        {
            RequestPath = "/news",
            Filters = [new AnalyticsFilter(AnalyticsDimension.Country, "Denmark")]
        };

        var rows = await client.GetBreakdownAsync(
            CreateConnection(), query, AnalyticsDimension.Referrer, 10, "goo", CancellationToken.None);

        Assert.Equal(new AnalyticsBreakdownRow("Google", 12, 8), Assert.Single(rows));
        Assert.Contains("visit:referrer", handler.Body);
        Assert.Contains("visit:country", handler.Body);
        Assert.Contains("event:page", handler.Body);
        Assert.Contains("contains", handler.Body);
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal("visitors", body.RootElement.GetProperty("order_by")[0][0].GetString());
    }

    [Fact]
    public async Task Breakdown_can_order_by_page_views()
    {
        var handler = new RecordingHandler("""{"results":[]}""");
        var client = CreateClient(handler);

        await client.GetBreakdownAsync(
            CreateConnection(),
            CreateQuery(),
            AnalyticsDimension.RequestPath,
            10,
            null,
            CancellationToken.None,
            AnalyticsTrafficMetric.PageViews);

        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal("pageviews", body.RootElement.GetProperty("order_by")[0][0].GetString());
        Assert.Equal("desc", body.RootElement.GetProperty("order_by")[0][1].GetString());
    }

    [Fact]
    public async Task Events_map_plausible_goals()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":["Signup"],"metrics":[9,7]}]}""");
        var client = CreateClient(handler);

        var rows = await client.GetEventsAsync(CreateConnection(), CreateQuery(), 20, null, CancellationToken.None);

        Assert.Equal(new AnalyticsEventRow("Signup", 9, 7), Assert.Single(rows));
        Assert.Contains("event:goal", handler.Body);
        Assert.Contains("events", handler.Body);
    }

    [Fact]
    public async Task Event_details_count_the_selected_plausible_goal()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":[],"metrics":[9,7]}]}""");
        var client = CreateClient(handler);

        var totals = await client.CountEventsAsync(
            CreateConnection(), CreateQuery(), "Read article", CancellationToken.None);

        Assert.Equal(new AnalyticsEventTotals(9, 7), totals);
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal("events", body.RootElement.GetProperty("metrics")[0].GetString());
        Assert.Equal("is", body.RootElement.GetProperty("filters")[0][0].GetString());
        Assert.Equal("event:goal", body.RootElement.GetProperty("filters")[0][1].GetString());
        Assert.Equal("Read article", body.RootElement.GetProperty("filters")[0][2][0].GetString());
    }

    [Fact]
    public async Task Event_properties_include_configured_names_and_event_specific_defaults()
    {
        var client = CreateClient(new RecordingHandler("{}"));
        var connection = CreateConnection(["locale", "title", "URL"]);

        var custom = await client.GetEventPropertyNamesAsync(
            connection, CreateQuery(), "Read case", null, CancellationToken.None);
        var outbound = await client.GetEventPropertyNamesAsync(
            connection, CreateQuery(), "Outbound Link: Click", null, CancellationToken.None);
        var notFound = await client.GetEventPropertyNamesAsync(
            connection, CreateQuery(), "404", null, CancellationToken.None);

        Assert.Equal(["locale", "title", "URL"], custom);
        Assert.Equal(["url", "locale", "title"], outbound);
        Assert.Equal(["path", "locale", "title", "URL"], notFound);
    }

    [Fact]
    public async Task Event_property_values_query_the_named_dimension_lazily()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":["da-DK"],"metrics":[15,12]}]}""");
        var client = CreateClient(handler);

        var values = await client.GetEventPropertyValuesAsync(
            CreateConnection(["locale"]),
            CreateQuery(),
            "Read case",
            "locale",
            20,
            "da",
            null,
            CancellationToken.None);

        Assert.Equal(new AnalyticsEventPropertyValue("da-DK", 15, 12), Assert.Single(values));
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal("event:props:locale", body.RootElement.GetProperty("dimensions")[0].GetString());
        Assert.Equal("events", body.RootElement.GetProperty("order_by")[0][0].GetString());
        Assert.Contains(body.RootElement.GetProperty("filters").EnumerateArray(), filter =>
            filter[0].GetString() == "is" && filter[1].GetString() == "event:goal");
        Assert.Contains(body.RootElement.GetProperty("filters").EnumerateArray(), filter =>
            filter[0].GetString() == "contains" && filter[1].GetString() == "event:props:locale");
    }

    [Fact]
    public async Task Event_property_filter_is_applied_to_event_totals()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":[],"metrics":[8,6]}]}""");
        var client = CreateClient(handler);

        var totals = await client.CountFilteredEventsAsync(
            CreateConnection(["locale"]),
            CreateQuery(),
            "Read case",
            new AnalyticsEventDataFilter("locale", "da-DK"),
            CancellationToken.None);

        Assert.Equal(new AnalyticsEventTotals(8, 6), totals);
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Contains(body.RootElement.GetProperty("filters").EnumerateArray(), filter =>
            filter[0].GetString() == "is" &&
            filter[1].GetString() == "event:props:locale" &&
            filter[2][0].GetString() == "da-DK");
    }

    [Fact]
    public async Task Unconfigured_event_property_is_not_queried()
    {
        var handler = new RecordingHandler("""{"results":[]}""");
        var client = CreateClient(handler);

        var values = await client.GetEventPropertyValuesAsync(
            CreateConnection(["locale"]),
            CreateQuery(),
            "Read case",
            "private-property",
            20,
            null,
            null,
            CancellationToken.None);

        Assert.Empty(values);
        Assert.Null(handler.Request);
    }

    [Fact]
    public async Task Trend_preserves_reporting_timezone_labels_and_fills_empty_buckets()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":["2026-07-02"],"metrics":[12,8]}],"meta":{"time_labels":["2026-07-01","2026-07-02","2026-07-03"]}}""");
        var client = CreateClient(handler);

        var points = await client.GetTrendAsync(CreateConnection(), CreateQuery(), CancellationToken.None);

        Assert.Equal(["2026-07-01", "2026-07-02", "2026-07-03"], points.Select(point => point.Timestamp));
        Assert.Equal([0L, 12L, 0L], points.Select(point => point.PageViews));
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.True(body.RootElement.GetProperty("include").GetProperty("time_labels").GetBoolean());
        Assert.Equal("time:day", body.RootElement.GetProperty("dimensions")[0].GetString());
    }

    [Fact]
    public async Task Hourly_trend_keeps_provider_local_wall_clock_time()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":["2026-07-01 23:00:00"],"metrics":[4,3]}],"meta":{"time_labels":["2026-07-01 23:00:00"]}}""");
        var client = CreateClient(handler);
        var query = CreateQuery() with { Interval = AnalyticsInterval.Hour };

        var point = Assert.Single(await client.GetTrendAsync(CreateConnection(), query, CancellationToken.None));

        Assert.Equal("2026-07-01T23:00:00", point.Timestamp);
    }

    [Fact]
    public async Task Referrer_breakdown_preserves_provider_values_and_metrics()
    {
        var handler = new RecordingHandler("""{"results":[{"dimensions":["https://www.example.com/one"],"metrics":[5,3]},{"dimensions":["example.com/two"],"metrics":[7,4]}]}""");
        var client = CreateClient(handler);

        var rows = await client.GetBreakdownAsync(
            CreateConnection(), CreateQuery(), AnalyticsDimension.Referrer, 10, null, CancellationToken.None);

        Assert.Equal([
            new AnalyticsBreakdownRow("https://www.example.com/one", 5, 3),
            new AnalyticsBreakdownRow("example.com/two", 7, 4)
        ], rows);
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal(10, body.RootElement.GetProperty("pagination").GetProperty("limit").GetInt32());
    }

    [Fact]
    public async Task Empty_aggregate_returns_zero_totals()
    {
        var client = CreateClient(new RecordingHandler("""{"results":[]}"""));

        var totals = await client.CountAsync(CreateConnection(), CreateQuery(), CancellationToken.None);

        Assert.Equal(new AnalyticsTotals(0, 0), totals);
    }

    [Fact]
    public async Task Multiple_aggregate_rows_are_rejected()
    {
        var client = CreateClient(new RecordingHandler("""{"results":[{"dimensions":[],"metrics":[1,1]},{"dimensions":[],"metrics":[2,2]}]}"""));

        await Assert.ThrowsAsync<JsonException>(() =>
            client.CountAsync(CreateConnection(), CreateQuery(), CancellationToken.None));
    }

    [Fact]
    public async Task Rows_with_an_unexpected_shape_are_rejected()
    {
        var client = CreateClient(new RecordingHandler("""{"results":[{"dimensions":["DK"],"metrics":[1]}]}"""));

        await Assert.ThrowsAsync<JsonException>(() =>
            client.GetBreakdownAsync(CreateConnection(), CreateQuery(), AnalyticsDimension.Country, 10, null, CancellationToken.None));
    }

    [Fact]
    public async Task Rate_limit_preserves_provider_identity_without_exposing_token()
    {
        var client = CreateClient(new RecordingHandler("{}", HttpStatusCode.TooManyRequests));

        var exception = await Assert.ThrowsAsync<AnalyticsProviderApiException>(() =>
            client.CountAsync(CreateConnection(), CreateQuery(), CancellationToken.None));

        Assert.Equal(AnalyticsProvider.Plausible, exception.Provider);
        Assert.Equal(HttpStatusCode.TooManyRequests, exception.StatusCode);
        Assert.DoesNotContain("secret", exception.ToString());
    }

    [Fact]
    public async Task Missing_results_are_rejected_as_an_untrusted_payload()
    {
        var client = CreateClient(new RecordingHandler("{}"));

        await Assert.ThrowsAsync<JsonException>(() =>
            client.CountAsync(CreateConnection(), CreateQuery(), CancellationToken.None));
    }

    [Theory]
    [InlineData(AnalyticsDimension.RequestPath, "event:page")]
    [InlineData(AnalyticsDimension.Referrer, "visit:referrer")]
    [InlineData(AnalyticsDimension.UtmCampaign, "visit:utm_campaign")]
    [InlineData(AnalyticsDimension.UtmTerm, "visit:utm_term")]
    [InlineData(AnalyticsDimension.UtmContent, "visit:utm_content")]
    [InlineData(AnalyticsDimension.Country, "visit:country")]
    [InlineData(AnalyticsDimension.BrowserName, "visit:browser")]
    public void Dimensions_are_mapped_to_plausible(AnalyticsDimension dimension, string expected) =>
        Assert.Equal(expected, PlausibleAnalyticsClient.ToApiDimension(dimension));

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.PaymentRequired)]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task Error_statuses_preserve_provider_identity(HttpStatusCode statusCode)
    {
        var client = CreateClient(new RecordingHandler("{}", statusCode));

        var exception = await Assert.ThrowsAsync<AnalyticsProviderApiException>(() =>
            client.CountAsync(CreateConnection(), CreateQuery(), CancellationToken.None));

        Assert.Equal(AnalyticsProvider.Plausible, exception.Provider);
        Assert.Equal(statusCode, exception.StatusCode);
    }

    private static PlausibleAnalyticsClient CreateClient(HttpMessageHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("https://plausible.io/") }, new AnalyticsProviderRequestGate());

    private static AnalyticsConnection CreateConnection(IReadOnlyList<string>? eventPropertyNames = null) => new(
        Guid.Parse("11111111-1111-1111-1111-111111111110"),
        "Plausible",
        AnalyticsProvider.Plausible,
        "secret",
        string.Empty,
        null,
        "example.com",
        eventPropertyNames ?? [],
        [],
        false,
        new HashSet<Guid>(),
        new HashSet<string>());

    private static AnalyticsQuery CreateQuery() => new(
        Guid.Parse("11111111-1111-1111-1111-111111111110"),
        new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
        new DateTimeOffset(2026, 7, 3, 0, 0, 0, TimeSpan.Zero),
        AnalyticsInterval.Day);

    private sealed class RecordingHandler(string body, HttpStatusCode statusCode = HttpStatusCode.OK) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
        }
    }
}
