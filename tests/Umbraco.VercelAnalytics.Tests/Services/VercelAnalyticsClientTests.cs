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
            CancellationToken.None);

        Assert.Contains("limit=100", handler.Request!.RequestUri!.Query);
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
