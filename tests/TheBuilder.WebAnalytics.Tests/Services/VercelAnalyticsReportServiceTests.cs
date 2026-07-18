using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class VercelAnalyticsReportServiceTests
{
    private static readonly Guid MainKey = Guid.Parse("11111111-1111-1111-1111-111111111110");

    [Fact]
    public async Task Summary_is_cached_by_normalized_query()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        var query = CreateQuery();

        var first = await service.GetSummaryAsync(query, CancellationToken.None);
        var second = await service.GetSummaryAsync(query, CancellationToken.None);

        Assert.NotNull(first);
        Assert.Same(first, second);
        Assert.Equal(2, client.CountCalls);
        Assert.Equal(1, client.TrendCalls);
        Assert.Equal(2, client.PageViewTotalCalls);
    }

    [Fact]
    public async Task Zero_cache_duration_disables_caching()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(
            CreateRegistry(cacheDuration: TimeSpan.Zero),
            client,
            cache);
        var query = CreateQuery();

        await service.GetSummaryAsync(query, CancellationToken.None);
        await service.GetSummaryAsync(query, CancellationToken.None);

        Assert.Equal(4, client.CountCalls);
        Assert.Equal(2, client.TrendCalls);
        Assert.Equal(4, client.PageViewTotalCalls);
    }

    [Fact]
    public async Task Summary_compares_with_the_immediately_preceding_range()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        var summary = await service.GetSummaryAsync(CreateQuery(), CancellationToken.None);

        Assert.NotNull(summary);
        Assert.Contains(client.CountQueries, query =>
            query.From == new DateTimeOffset(2026, 6, 16, 0, 0, 0, TimeSpan.Zero) &&
            query.To == new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero));
        Assert.NotNull(summary.PreviousTotals);
    }

    [Fact]
    public async Task Summary_remains_available_when_the_previous_range_is_unavailable()
    {
        var client = new CountingClient { FailPreviousCount = true };
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        var summary = await service.GetSummaryAsync(CreateQuery(), CancellationToken.None);

        Assert.NotNull(summary);
        Assert.Null(summary.PreviousTotals);
        Assert.Equal(new AnalyticsTotals(20, 10), summary.Totals);
    }

    [Fact]
    public async Task Summary_omits_comparison_when_the_previous_range_would_precede_date_minimum()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        var minimumDate = DateTimeOffset.MinValue;

        var summary = await service.GetSummaryAsync(
            CreateQuery() with { From = minimumDate, To = minimumDate.AddDays(1) },
            CancellationToken.None);

        Assert.NotNull(summary);
        Assert.Null(summary.PreviousTotals);
        Assert.Equal(1, client.CountCalls);
        Assert.Equal([minimumDate], client.CountQueries.Select(query => query.From));
    }

    [Fact]
    public async Task Breakdown_cache_separates_dimensions()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await service.GetBreakdownAsync(CreateQuery(), AnalyticsDimension.Country, 10, null, CancellationToken.None);
        await service.GetBreakdownAsync(CreateQuery(), AnalyticsDimension.DeviceType, 10, null, CancellationToken.None);

        Assert.Equal(2, client.BreakdownCalls);
    }

    [Fact]
    public async Task Breakdown_cache_separates_search_terms()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await service.GetBreakdownAsync(CreateQuery(), AnalyticsDimension.RequestPath, 100, "news", CancellationToken.None);
        await service.GetBreakdownAsync(CreateQuery(), AnalyticsDimension.RequestPath, 100, "about", CancellationToken.None);

        Assert.Equal(2, client.BreakdownCalls);
    }

    [Fact]
    public async Task Summary_cache_separates_filter_values()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await service.GetSummaryAsync(CreateQuery() with
        {
            Filters = [new AnalyticsFilter(AnalyticsDimension.Country, "DK")]
        }, CancellationToken.None);
        await service.GetSummaryAsync(CreateQuery() with
        {
            Filters = [new AnalyticsFilter(AnalyticsDimension.Country, "US")]
        }, CancellationToken.None);

        Assert.Equal(4, client.CountCalls);
        Assert.Equal(2, client.TrendCalls);
        Assert.Equal(4, client.PageViewTotalCalls);
    }

    [Fact]
    public async Task Events_are_cached_by_search_and_document_scope()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        var query = CreateQuery() with { RequestPath = "/news" };

        await service.GetEventsAsync(query, 100, "signup", CancellationToken.None);
        await service.GetEventsAsync(query, 100, "signup", CancellationToken.None);
        await service.GetEventsAsync(query, 100, "purchase", CancellationToken.None);

        Assert.Equal(2, client.EventCalls);
    }

    [Fact]
    public async Task Event_details_return_property_names_without_eagerly_loading_values()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        var first = await service.GetEventDetailsAsync(CreateQuery(), "Signup", null, CancellationToken.None);
        var second = await service.GetEventDetailsAsync(CreateQuery(), "Signup", null, CancellationToken.None);

        Assert.NotNull(first);
        Assert.Same(first, second);
        Assert.Equal(new AnalyticsEventTotals(30, 12), first.Totals);
        var property = Assert.Single(first.Properties);
        Assert.Equal("plan", property.Name);
        Assert.Empty(property.Values);
        Assert.Equal(1, client.EventCountCalls);
        Assert.Equal(1, client.EventPropertyNameCalls);
        Assert.Equal(0, client.EventPropertyValueCalls);
    }

    [Fact]
    public async Task Event_details_cache_and_queries_include_the_event_data_filter()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        var filter = new AnalyticsEventDataFilter("plan", "Enterprise");

        await service.GetEventDetailsAsync(CreateQuery(), "Signup", filter, CancellationToken.None);
        await service.GetEventDetailsAsync(CreateQuery(), "Signup", filter, CancellationToken.None);
        await service.GetEventDetailsAsync(CreateQuery(), "Signup", new("plan", "Pro"), CancellationToken.None);

        Assert.Equal(2, client.EventCountCalls);
        Assert.Equal(new AnalyticsEventDataFilter("plan", "Pro"), client.LastEventDataFilter);
    }

    [Fact]
    public async Task Event_property_search_is_server_backed_and_cached_by_search_term()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        var first = await service.GetEventPropertyValuesAsync(CreateQuery(), "Signup", "plan", 100, "enterprise", null, CancellationToken.None);
        var second = await service.GetEventPropertyValuesAsync(CreateQuery(), "Signup", "plan", 100, "enterprise", null, CancellationToken.None);
        await service.GetEventPropertyValuesAsync(CreateQuery(), "Signup", "plan", 100, "pro", null, CancellationToken.None);

        Assert.NotNull(first);
        Assert.Same(first, second);
        Assert.Equal("plan", first.Name);
        Assert.Equal(2, client.EventPropertyValueCalls);
        Assert.Equal("pro", client.LastEventPropertySearch);
    }

    [Fact]
    public async Task Cancellation_is_forwarded_to_the_Vercel_client()
    {
        var client = new CountingClient();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.GetSummaryAsync(CreateQuery(), cancellation.Token));
    }

    private static AnalyticsQuery CreateQuery() => new(
        MainKey,
        new DateOnly(2026, 7, 1),
        new DateOnly(2026, 7, 15),
        AnalyticsInterval.Day);

    private static VercelAnalyticsConnectionRegistry CreateRegistry(TimeSpan? cacheDuration = null) => new(Options.Create(new VercelAnalyticsOptions
    {
        Enabled = true,
        AccessToken = "secret",
        CacheDuration = cacheDuration ?? TimeSpan.FromMinutes(5),
        Connections =
        [
            new()
            {
                Key = MainKey,
                DisplayName = "Main",
                ProjectId = "project",
                DocumentRootKeys = [Guid.NewGuid().ToString()],
                EnabledDocumentTypes = ["articlePage"]
            }
        ]
    }));

    private sealed class CountingClient : IVercelAnalyticsClient
    {
        public int CountCalls { get; private set; }
        public int TrendCalls { get; private set; }
        public int PageViewTotalCalls { get; private set; }
        public int BreakdownCalls { get; private set; }
        public int EventCalls { get; private set; }
        public int EventCountCalls { get; private set; }
        public int EventPropertyNameCalls { get; private set; }
        public int EventPropertyValueCalls { get; private set; }
        public AnalyticsEventDataFilter? LastEventDataFilter { get; private set; }
        public string? LastEventPropertySearch { get; private set; }
        public bool FailPreviousCount { get; init; }
        public List<AnalyticsQuery> CountQueries { get; } = [];

        public Task<string> GetProjectNameAsync(VercelAnalyticsConnection connection, CancellationToken cancellationToken) =>
            Task.FromResult(connection.DisplayName);

        public Task<AnalyticsTotals> CountAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            CountCalls++;
            CountQueries.Add(query);
            if (FailPreviousCount && query.To <= new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero))
            {
                throw new VercelAnalyticsApiException(System.Net.HttpStatusCode.PaymentRequired);
            }
            return Task.FromResult(new AnalyticsTotals(20, 10));
        }

        public Task<long> GetPageViewTotalAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            PageViewTotalCalls++;
            return Task.FromResult(20L);
        }

        public Task<IReadOnlyList<AnalyticsPoint>> GetTrendAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            TrendCalls++;
            return Task.FromResult<IReadOnlyList<AnalyticsPoint>>([
                new(query.From, 20, 10)
            ]);
        }

        public Task<IReadOnlyList<AnalyticsBreakdownRow>> GetBreakdownAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, AnalyticsDimension dimension, int limit, string? search, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            BreakdownCalls++;
            return Task.FromResult<IReadOnlyList<AnalyticsBreakdownRow>>([]);
        }

        public Task<AnalyticsEventTotals> CountEventsAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, string eventName, AnalyticsEventDataFilter? eventDataFilter, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            EventCountCalls++;
            LastEventDataFilter = eventDataFilter;
            return Task.FromResult(new AnalyticsEventTotals(30, 12));
        }

        public Task<IReadOnlyList<AnalyticsEventRow>> GetEventsAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, int limit, string? search, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            EventCalls++;
            return Task.FromResult<IReadOnlyList<AnalyticsEventRow>>([]);
        }

        public Task<IReadOnlyList<AnalyticsFlagRow>> GetFlagsAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, string? flagKey, int limit, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult<IReadOnlyList<AnalyticsFlagRow>>([]);
        }

        public Task<IReadOnlyList<string>> GetEventPropertyNamesAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, string eventName, AnalyticsEventDataFilter? eventDataFilter, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            EventPropertyNameCalls++;
            return Task.FromResult<IReadOnlyList<string>>(["plan"]);
        }

        public Task<IReadOnlyList<AnalyticsEventPropertyValue>> GetEventPropertyValuesAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, string eventName, string propertyName, int limit, string? search, AnalyticsEventDataFilter? eventDataFilter, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            EventPropertyValueCalls++;
            LastEventPropertySearch = search;
            return Task.FromResult<IReadOnlyList<AnalyticsEventPropertyValue>>([new("Pro", 20, 10)]);
        }
    }
}
