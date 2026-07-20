using Microsoft.Extensions.Options;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class MockAnalyticsClientTests
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
    public void Registry_disables_mock_connections_unless_the_package_harness_opts_in()
    {
        var options = Options.Create(new WebAnalyticsOptions
        {
            Connections =
            [
                new() { Key = MockKey, DisplayName = "Mock analytics", MockScenario = MockAnalyticsScenario.Complete }
            ]
        });
        var disabled = new AnalyticsConnectionRegistry(new WebAnalyticsSettingsStore(options), options);
        options.Value.EnableMockConnections = true;
        var enabled = new AnalyticsConnectionRegistry(new WebAnalyticsSettingsStore(options), options);

        Assert.False(disabled.MockConnectionsEnabled);
        Assert.Null(disabled.Get(MockKey));
        Assert.True(enabled.MockConnectionsEnabled);
        Assert.NotNull(enabled.Get(MockKey));
    }

    [Fact]
    public async Task Scenarios_expose_their_targeted_reports()
    {
        var client = new MockAnalyticsClient();
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
    public async Task Demo_exposes_every_report_with_a_non_repeating_trend()
    {
        var client = new MockAnalyticsClient();
        var connection = CreateRegistry(MockAnalyticsScenario.Complete, true).Get(MockKey)!;
        var query = new AnalyticsQuery(
            MockKey,
            new DateOnly(2026, 6, 1),
            new DateOnly(2026, 7, 15),
            AnalyticsInterval.Day);

        var trend = await client.GetTrendAsync(connection, query, CancellationToken.None);
        var utmRows = await client.GetBreakdownAsync(connection, query, AnalyticsDimension.UtmCampaign, 10, null, CancellationToken.None);
        var flagRows = await client.GetFlagsAsync(connection, query, null, 10, CancellationToken.None);
        var eventRows = await client.GetEventsAsync(connection, query, 10, null, CancellationToken.None);

        Assert.NotEmpty(utmRows);
        Assert.NotEmpty(flagRows);
        Assert.NotEmpty(eventRows);
        Assert.True(trend.Select(point => point.PageViews).Distinct().Count() >= trend.Count * 0.9);
    }

    [Fact]
    public async Task Demo_totals_increase_slightly_over_the_previous_period()
    {
        var client = new MockAnalyticsClient();
        var connection = CreateRegistry(MockAnalyticsScenario.Complete, true).Get(MockKey)!;
        var current = new AnalyticsQuery(
            MockKey,
            new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
            AnalyticsInterval.Day);
        var previous = current with
        {
            From = current.From - (current.To - current.From),
            To = current.From
        };

        var currentTotals = await client.CountAsync(connection, current, CancellationToken.None);
        var previousTotals = await client.CountAsync(connection, previous, CancellationToken.None);
        var visitorGrowth = (double)currentTotals.Visitors / previousTotals.Visitors;
        var pageViewGrowth = (double)currentTotals.PageViews / previousTotals.PageViews;

        Assert.InRange(visitorGrowth, 1.01d, 1.04d);
        Assert.InRange(pageViewGrowth, 1.01d, 1.04d);
    }

    [Fact]
    public async Task Demo_filters_update_matching_and_cross_dimension_reports()
    {
        var client = new MockAnalyticsClient();
        var connection = CreateRegistry(MockAnalyticsScenario.Complete, true).Get(MockKey)!;
        var baseline = CreateQuery();
        var filtered = baseline with
        {
            Filters = [new AnalyticsFilter(AnalyticsDimension.Country, "DK")]
        };

        var baselineDevices = await client.GetBreakdownAsync(
            connection, baseline, AnalyticsDimension.DeviceType, 10, null, CancellationToken.None);
        var filteredDevices = await client.GetBreakdownAsync(
            connection, filtered, AnalyticsDimension.DeviceType, 10, null, CancellationToken.None);
        var filteredCountries = await client.GetBreakdownAsync(
            connection, filtered, AnalyticsDimension.Country, 10, null, CancellationToken.None);

        Assert.All(filteredDevices.Zip(baselineDevices), pair =>
            Assert.True(pair.First.Visitors < pair.Second.Visitors));
        Assert.Equal("DK", Assert.Single(filteredCountries).Value);
    }

    [Fact]
    public async Task Demo_event_filter_returns_only_the_selected_event()
    {
        var client = new MockAnalyticsClient();
        var connection = CreateRegistry(MockAnalyticsScenario.Complete, true).Get(MockKey)!;
        var query = CreateQuery() with
        {
            Filters = [new AnalyticsFilter(AnalyticsDimension.EventName, "Demo requested")]
        };

        var events = await client.GetEventsAsync(connection, query, 10, null, CancellationToken.None);

        Assert.Equal("Demo requested", Assert.Single(events).EventName);
    }

    [Fact]
    public async Task Router_serves_mock_reports_without_contacting_Vercel()
    {
        var handler = new RejectingHttpMessageHandler();
        var router = new AnalyticsProviderClientResolver(
            new VercelAnalyticsClient(new HttpClient(handler), new AnalyticsProviderRequestGate()),
            new MockAnalyticsClient(),
            new PlausibleAnalyticsClient(new HttpClient(handler), new AnalyticsProviderRequestGate()));
        using var cache = new AnalyticsReportCache();
        var service = new AnalyticsReportService(
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

    private static AnalyticsConnectionRegistry CreateRegistry(
        MockAnalyticsScenario scenario,
        bool mockConnectionsEnabled)
    {
        var options = Options.Create(new WebAnalyticsOptions
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
        return new AnalyticsConnectionRegistry(
            new WebAnalyticsSettingsStore(options),
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
