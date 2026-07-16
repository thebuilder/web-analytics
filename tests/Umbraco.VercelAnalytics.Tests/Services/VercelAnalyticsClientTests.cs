using System.Net;
using System.Text;
using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;
using Umbraco.VercelAnalytics.Services;

namespace Umbraco.VercelAnalytics.Tests.Services;

public sealed class VercelAnalyticsClientTests
{
    [Fact]
    public async Task Count_builds_encoded_team_query_and_bearer_header()
    {
        var handler = new RecordingHandler("""{"data":{"pageviews":42,"visitors":31}}""");
        var client = CreateClient(handler);
        var connection = CreateConnection(teamId: "team_123");
        var query = new AnalyticsQuery(
            connection.Alias,
            new DateOnly(2026, 7, 1),
            new DateOnly(2026, 7, 15),
            AnalyticsInterval.Day,
            "/news/editor's-pick");

        var result = await client.CountAsync(connection, query, CancellationToken.None);

        Assert.Equal(new AnalyticsTotals(42, 31), result);
        Assert.Equal("Bearer", handler.Request!.Headers.Authorization?.Scheme);
        Assert.Equal("secret", handler.Request.Headers.Authorization?.Parameter);
        Assert.Contains("teamId=team_123", handler.Request.RequestUri!.Query);
        Assert.Contains("filter=requestPath%20eq%20%27%2Fnews%2Feditor%27%27s-pick%27", handler.Request.RequestUri.Query);
    }

    [Fact]
    public async Task Trend_parses_aggregate_points()
    {
        var handler = new RecordingHandler(
            """{"data":[{"timestamp":"2026-07-01T00:00:00Z","pageviews":10,"visitors":8}]}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();

        var result = await client.GetTrendAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day),
            CancellationToken.None);

        Assert.Single(result);
        Assert.Equal(10, result[0].PageViews);
        Assert.Contains("by=day", handler.Request!.RequestUri!.Query);
    }

    [Fact]
    public async Task Breakdown_parses_requested_dimension()
    {
        var handler = new RecordingHandler(
            """{"data":[{"country":"DK","pageviews":20,"visitors":14}]}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();

        var result = await client.GetBreakdownAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day),
            AnalyticsDimension.Country,
            10,
            null,
            CancellationToken.None);

        Assert.Equal(new AnalyticsBreakdownRow("DK", 20, 14), Assert.Single(result));
        Assert.Contains("by=country", handler.Request!.RequestUri!.Query);
    }

    [Fact]
    public async Task Breakdown_forwards_on_demand_result_limit()
    {
        var handler = new RecordingHandler("""{"data":[]}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();

        await client.GetBreakdownAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day),
            AnalyticsDimension.RequestPath,
            100,
            null,
            CancellationToken.None);

        Assert.Contains("limit=100", handler.Request!.RequestUri!.Query);
    }

    [Fact]
    public async Task Breakdown_combines_document_scope_and_escaped_search_filter()
    {
        var handler = new RecordingHandler("""{"data":[]}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();

        await client.GetBreakdownAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day, "/news"),
            AnalyticsDimension.ReferrerHostname,
            100,
            "editor's",
            CancellationToken.None);

        Assert.Contains(
            "filter=requestPath eq '/news' and contains(referrerHostname, 'editor''s')",
            Uri.UnescapeDataString(handler.Request!.RequestUri!.Query));
    }

    [Fact]
    public async Task Count_combines_allowlisted_filters_and_escapes_values()
    {
        var handler = new RecordingHandler("""{"data":{"pageviews":42,"visitors":31}}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();
        var query = new AnalyticsQuery(
            connection.Alias,
            new DateOnly(2026, 7, 1),
            new DateOnly(2026, 7, 2),
            AnalyticsInterval.Day,
            Filters:
            [
                new AnalyticsFilter(AnalyticsDimension.Country, "DK"),
                new AnalyticsFilter(AnalyticsDimension.ReferrerHostname, "editor's.example")
            ]);

        await client.CountAsync(connection, query, CancellationToken.None);

        Assert.Contains(
            "filter=country eq 'DK' and referrerHostname eq 'editor''s.example'",
            Uri.UnescapeDataString(handler.Request!.RequestUri!.Query));
    }

    [Fact]
    public async Task Event_count_combines_validated_route_and_escaped_event_filter()
    {
        var handler = new RecordingHandler("""{"data":{"count":42,"visitors":31}}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();

        var result = await client.CountEventsAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day, "/editor's"),
            "CTA's click",
            CancellationToken.None);

        Assert.Equal(new AnalyticsEventTotals(42, 31), result);
        Assert.EndsWith("/events/count", handler.Request!.RequestUri!.AbsolutePath);
        Assert.Contains(
            "filter=requestPath eq '/editor''s' and eventName eq 'CTA''s click'",
            Uri.UnescapeDataString(handler.Request.RequestUri.Query));
    }

    [Fact]
    public async Task Events_parse_event_name_totals_and_server_side_search()
    {
        var handler = new RecordingHandler(
            """{"data":[{"eventName":"Signup","count":20,"visitors":14}]}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();

        var result = await client.GetEventsAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day),
            100,
            "sign'up",
            CancellationToken.None);

        Assert.Equal(new AnalyticsEventRow("Signup", 20, 14), Assert.Single(result));
        Assert.EndsWith("/events/aggregate", handler.Request!.RequestUri!.AbsolutePath);
        Assert.Contains("by=eventName", handler.Request.RequestUri.Query);
        Assert.Contains("limit=100", handler.Request.RequestUri.Query);
        Assert.Contains("contains(eventName, 'sign''up')", Uri.UnescapeDataString(handler.Request.RequestUri.Query));
    }

    [Fact]
    public async Task Event_properties_are_discovered_from_bare_event_data_group()
    {
        var handler = new RecordingHandler(
            """{"data":[{"eventData":"plan","count":10,"visitors":8},{"eventData":"Others","count":1,"visitors":1}]}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();

        var result = await client.GetEventPropertyNamesAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day),
            "Signup",
            CancellationToken.None);

        Assert.Equal("plan", Assert.Single(result));
        Assert.Contains("by=eventData", handler.Request!.RequestUri!.Query);
        Assert.Contains("eventName eq 'Signup'", Uri.UnescapeDataString(handler.Request.RequestUri.Query));
    }

    [Fact]
    public async Task Event_property_values_parse_metrics_and_quote_dynamic_dimension()
    {
        var handler = new RecordingHandler(
            """{"data":[{"signup-source":"Enterprise","count":12,"visitors":10}]}""");
        var client = CreateClient(handler);
        var connection = CreateConnection();

        var result = await client.GetEventPropertyValuesAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day, "/news"),
            "Signup",
            "signup-source",
            100,
            CancellationToken.None);

        Assert.Equal(new AnalyticsEventPropertyValue("Enterprise", 12, 10), Assert.Single(result));
        Assert.Contains("by=eventData%2F%27signup-source%27", handler.Request!.RequestUri!.Query);
        Assert.Contains("limit=100", handler.Request.RequestUri.Query);
        Assert.Contains("filter=requestPath eq '/news' and eventName eq 'Signup'", Uri.UnescapeDataString(handler.Request.RequestUri.Query));
    }

    [Fact]
    public async Task Error_response_throws_sanitized_exception()
    {
        var handler = new RecordingHandler("forbidden", HttpStatusCode.Forbidden);
        var client = CreateClient(handler);
        var connection = CreateConnection();

        var exception = await Assert.ThrowsAsync<VercelAnalyticsApiException>(() => client.CountAsync(
            connection,
            new AnalyticsQuery(connection.Alias, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 2), AnalyticsInterval.Day),
            CancellationToken.None));

        Assert.Equal(HttpStatusCode.Forbidden, exception.StatusCode);
        Assert.DoesNotContain("secret", exception.Message);
    }

    private static VercelAnalyticsClient CreateClient(HttpMessageHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("https://api.vercel.com/") });

    private static VercelAnalyticsConnection CreateConnection(string? teamId = null) => new(
        "main", "Main", "secret", "project", teamId, null,
        new HashSet<string> { "example.com" },
        [Guid.Parse("11111111-1111-1111-1111-111111111111")],
        false,
        new HashSet<Guid>(),
        new HashSet<string> { "articlePage" });

    private sealed class RecordingHandler(string body, HttpStatusCode statusCode = HttpStatusCode.OK) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            return Task.FromResult(new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            });
        }
    }
}
