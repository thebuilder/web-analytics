using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;
using Umbraco.VercelAnalytics.Services;

namespace Umbraco.VercelAnalytics.Tests.Services;

public sealed class MockVercelAnalyticsClientTests
{
    private static readonly Guid MockKey = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public void Registry_only_activates_mock_connections_when_enabled()
    {
        var developmentRegistry = CreateRegistry(MockAnalyticsScenario.Complete, mockConnectionsEnabled: true);
        var productionRegistry = CreateRegistry(MockAnalyticsScenario.Complete, mockConnectionsEnabled: false);

        var activeConnection = developmentRegistry.Get(MockKey);

        Assert.NotNull(activeConnection);
        Assert.True(activeConnection.IsMock);
        Assert.True(activeConnection.IsConfigured);
        Assert.Null(productionRegistry.Get(MockKey));
        Assert.Equal(MockAnalyticsScenario.Complete, Assert.Single(productionRegistry.Settings.Connections).MockScenario);
    }

    [Fact]
    public async Task Scenarios_expose_their_targeted_reports()
    {
        var client = new MockVercelAnalyticsClient();
        var query = CreateQuery();
        var utm = CreateRegistry(MockAnalyticsScenario.Utm, true).Get(MockKey)!;
        var flags = CreateRegistry(MockAnalyticsScenario.Flags, true).Get(MockKey)!;
        var events = CreateRegistry(MockAnalyticsScenario.Events, true).Get(MockKey)!;

        var utmRows = await client.GetBreakdownAsync(utm, query, AnalyticsDimension.UtmCampaign, 10, null, CancellationToken.None);
        var flagRows = await client.GetFlagsAsync(flags, query, null, 10, CancellationToken.None);
        var eventRows = await client.GetEventsAsync(events, query, 10, null, CancellationToken.None);

        Assert.Contains(utmRows, row => row.Value == "summer-launch");
        Assert.Contains(flagRows, row => row.Value == "new-pricing-page");
        Assert.Contains(eventRows, row => row.EventName == "Signup completed");
    }

    [Fact]
    public async Task Router_serves_mock_reports_without_contacting_Vercel()
    {
        var handler = new RejectingHttpMessageHandler();
        var router = new VercelAnalyticsClientRouter(
            new VercelAnalyticsClient(new HttpClient(handler)),
            new MockVercelAnalyticsClient());
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(
            CreateRegistry(MockAnalyticsScenario.Complete, true),
            router,
            cache);

        var summary = await service.GetSummaryAsync(CreateQuery(), CancellationToken.None);

        Assert.NotNull(summary);
        Assert.NotEmpty(summary.Points);
        Assert.True(summary.Totals.PageViews > 0);
        Assert.Equal(0, handler.RequestCount);
    }

    private static AnalyticsQuery CreateQuery() => new(
        MockKey,
        new DateOnly(2026, 7, 1),
        new DateOnly(2026, 7, 15),
        AnalyticsInterval.Day);

    private static VercelAnalyticsConnectionRegistry CreateRegistry(
        MockAnalyticsScenario scenario,
        bool mockConnectionsEnabled)
    {
        var options = Options.Create(new VercelAnalyticsOptions
        {
            Enabled = true,
            Connections =
            [
                new()
                {
                    Key = MockKey,
                    DisplayName = "Mock analytics",
                    MockScenario = scenario
                }
            ]
        });
        return new VercelAnalyticsConnectionRegistry(
            new VercelAnalyticsSettingsStore(options),
            options,
            mockConnectionsEnabled);
    }

    private sealed class RejectingHttpMessageHandler : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            throw new InvalidOperationException("Mock connections must not contact Vercel.");
        }
    }
}
