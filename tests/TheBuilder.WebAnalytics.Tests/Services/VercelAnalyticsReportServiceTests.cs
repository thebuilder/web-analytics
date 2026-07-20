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
        using var cache = new AnalyticsReportCache();
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
        using var cache = new AnalyticsReportCache();
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
        using var cache = new AnalyticsReportCache();
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
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        var summary = await service.GetSummaryAsync(CreateQuery(), CancellationToken.None);

        Assert.NotNull(summary);
        Assert.Null(summary.PreviousTotals);
        Assert.Equal(new AnalyticsTotals(20, 10), summary.Totals);
    }

    public static TheoryData<Func<Exception>> OptionalPreviousRangeFailures =>
    [
        () => new VercelAnalyticsApiException(System.Net.HttpStatusCode.PaymentRequired),
        () => new HttpRequestException(),
        () => new System.Text.Json.JsonException(),
        () => new OperationCanceledException()
    ];

    [Theory]
    [MemberData(nameof(OptionalPreviousRangeFailures))]
    public async Task Summary_remains_available_when_an_optional_previous_range_request_fails(
        Func<Exception> createException)
    {
        var client = new CountingClient { PreviousCountException = createException() };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        var summary = await service.GetSummaryAsync(CreateQuery(), CancellationToken.None);

        Assert.NotNull(summary);
        Assert.Equal(new AnalyticsTotals(20, 10), summary.Totals);
        Assert.Null(summary.PreviousTotals);
        Assert.Single(summary.Points);
    }

    [Fact]
    public async Task Summary_propagates_caller_cancellation_during_an_optional_previous_range_request()
    {
        using var cancellation = new CancellationTokenSource();
        var client = new CountingClient
        {
            PreviousCountException = new OperationCanceledException(),
            BeforePreviousCountFailure = cancellation.Cancel
        };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.GetSummaryAsync(CreateQuery(), cancellation.Token));
    }

    [Fact]
    public async Task Cancelling_one_summary_waiter_during_an_optional_previous_range_request_preserves_the_shared_report()
    {
        var previousCountStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releasePreviousCount = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var firstCancellation = new CancellationTokenSource();
        var client = new CountingClient
        {
            PreviousCountException = new OperationCanceledException(),
            PreviousCountStarted = previousCountStarted,
            PreviousCountRelease = releasePreviousCount
        };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        var first = service.GetSummaryAsync(CreateQuery(), firstCancellation.Token);
        await previousCountStarted.Task;
        var second = service.GetSummaryAsync(CreateQuery(), CancellationToken.None);

        firstCancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);

        releasePreviousCount.SetResult();
        var summary = await second;

        Assert.NotNull(summary);
        Assert.Equal(new AnalyticsTotals(20, 10), summary.Totals);
        Assert.Null(summary.PreviousTotals);
        Assert.Equal(2, client.CountCalls);
    }

    [Fact]
    public async Task Summary_propagates_malformed_current_range_data()
    {
        var client = new CountingClient { CurrentCountException = new System.Text.Json.JsonException() };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await Assert.ThrowsAsync<System.Text.Json.JsonException>(() =>
            service.GetSummaryAsync(CreateQuery(), CancellationToken.None));
    }

    [Fact]
    public async Task Summary_propagates_unexpected_previous_range_failures()
    {
        var client = new CountingClient { PreviousCountException = new InvalidOperationException() };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.GetSummaryAsync(CreateQuery(), CancellationToken.None));
    }

    [Fact]
    public async Task Summary_propagates_an_unexpected_previous_page_view_failure_when_count_has_an_optional_failure()
    {
        var client = new CountingClient
        {
            PreviousCountException = new VercelAnalyticsApiException(System.Net.HttpStatusCode.PaymentRequired),
            PreviousPageViewTotalException = new InvalidOperationException()
        };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.GetSummaryAsync(CreateQuery(), CancellationToken.None));
    }

    [Fact]
    public async Task Summary_propagates_an_unexpected_previous_count_failure_when_page_views_have_an_optional_failure()
    {
        var client = new CountingClient
        {
            PreviousCountException = new InvalidOperationException(),
            PreviousPageViewTotalException = new VercelAnalyticsApiException(System.Net.HttpStatusCode.PaymentRequired)
        };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.GetSummaryAsync(CreateQuery(), CancellationToken.None));
    }

    [Fact]
    public async Task Summary_omits_comparison_when_the_previous_range_would_precede_date_minimum()
    {
        var client = new CountingClient();
        using var cache = new AnalyticsReportCache();
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
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await service.GetBreakdownAsync(CreateQuery(), AnalyticsDimension.Country, 10, null, CancellationToken.None);
        await service.GetBreakdownAsync(CreateQuery(), AnalyticsDimension.DeviceType, 10, null, CancellationToken.None);

        Assert.Equal(2, client.BreakdownCalls);
    }

    [Fact]
    public async Task Breakdown_cache_separates_search_terms()
    {
        var client = new CountingClient();
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        await service.GetBreakdownAsync(CreateQuery(), AnalyticsDimension.RequestPath, 100, "news", CancellationToken.None);
        await service.GetBreakdownAsync(CreateQuery(), AnalyticsDimension.RequestPath, 100, "about", CancellationToken.None);

        Assert.Equal(2, client.BreakdownCalls);
    }

    [Fact]
    public async Task Summary_cache_separates_filter_values()
    {
        var client = new CountingClient();
        using var cache = new AnalyticsReportCache();
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
        using var cache = new AnalyticsReportCache();
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
        using var cache = new AnalyticsReportCache();
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
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        var filter = new AnalyticsEventDataFilter("plan", "Enterprise");

        await service.GetEventDetailsAsync(CreateQuery(), "Signup", filter, CancellationToken.None);
        await service.GetEventDetailsAsync(CreateQuery(), "Signup", filter, CancellationToken.None);
        await service.GetEventDetailsAsync(CreateQuery(), "Signup", new("plan", "Pro"), CancellationToken.None);

        Assert.Equal(2, client.EventCountCalls);
        Assert.Equal(new AnalyticsEventDataFilter("plan", "Pro"), client.LastEventDataFilter);
    }

    [Fact]
    public async Task Event_details_cache_distinguishes_event_names_from_filter_segments()
    {
        var client = new CountingClient();
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        var filter = new AnalyticsEventDataFilter("plan", "Pro");

        await service.GetEventDetailsAsync(CreateQuery(), "Signup:cGxhbg==:UHJv", null, CancellationToken.None);
        await service.GetEventDetailsAsync(CreateQuery(), "Signup", filter, CancellationToken.None);

        Assert.Equal(2, client.EventCountCalls);
        Assert.Equal(
            [("Signup:cGxhbg==:UHJv", (AnalyticsEventDataFilter?)null), ("Signup", filter)],
            client.EventDetailCalls);
    }

    [Fact]
    public async Task Event_property_search_is_server_backed_and_cached_by_search_term()
    {
        var client = new CountingClient();
        using var cache = new AnalyticsReportCache();
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
    public async Task Already_cancelled_summary_does_not_call_the_Vercel_client()
    {
        var client = new CountingClient();
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.GetSummaryAsync(CreateQuery(), cancellation.Token));

        Assert.Equal(0, client.CountCalls);
        Assert.Equal(0, client.PageViewTotalCalls);
        Assert.Equal(0, client.TrendCalls);
    }

    [Fact]
    public async Task Concurrent_identical_summaries_share_one_client_fanout()
    {
        var countStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseCounts = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var client = new CountingClient { CountStarted = countStarted, CountRelease = releaseCounts };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);

        var first = service.GetSummaryAsync(CreateQuery(), CancellationToken.None);
        await countStarted.Task;
        var second = service.GetSummaryAsync(CreateQuery(), CancellationToken.None);

        releaseCounts.SetResult();
        var summaries = await Task.WhenAll(first, second);

        Assert.NotNull(summaries[0]);
        Assert.Same(summaries[0], summaries[1]);
        Assert.Equal(2, client.CountCalls);
        Assert.Equal(2, client.PageViewTotalCalls);
        Assert.Equal(1, client.TrendCalls);
    }

    [Fact]
    public async Task Cancelling_one_summary_waiter_does_not_cancel_the_shared_client_fanout()
    {
        var countStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseCounts = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var client = new CountingClient { CountStarted = countStarted, CountRelease = releaseCounts };
        using var cache = new AnalyticsReportCache();
        var service = new VercelAnalyticsReportService(CreateRegistry(), client, cache);
        using var firstCancellation = new CancellationTokenSource();

        var first = service.GetSummaryAsync(CreateQuery(), firstCancellation.Token);
        await countStarted.Task;
        var second = service.GetSummaryAsync(CreateQuery(), CancellationToken.None);

        firstCancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        Assert.False(client.LastCountCancellationToken.IsCancellationRequested);

        releaseCounts.SetResult();
        Assert.NotNull(await second);
        Assert.Equal(2, client.CountCalls);
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
        public TaskCompletionSource? CountStarted { get; init; }
        public TaskCompletionSource? CountRelease { get; init; }
        public CancellationToken LastCountCancellationToken { get; private set; }
        public Exception? CurrentCountException { get; init; }
        public Exception? PreviousCountException { get; init; }
        public Exception? PreviousPageViewTotalException { get; init; }
        public Action? BeforePreviousCountFailure { get; init; }
        public TaskCompletionSource? PreviousCountStarted { get; init; }
        public TaskCompletionSource? PreviousCountRelease { get; init; }
        public List<AnalyticsQuery> CountQueries { get; } = [];
        public List<(string EventName, AnalyticsEventDataFilter? Filter)> EventDetailCalls { get; } = [];

        public Task<string> GetProjectNameAsync(VercelAnalyticsConnection connection, CancellationToken cancellationToken) =>
            Task.FromResult(connection.DisplayName);

        public async Task<AnalyticsTotals> CountAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            LastCountCancellationToken = cancellationToken;
            CountCalls++;
            CountQueries.Add(query);
            if (query.To > new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero) && CurrentCountException is not null)
            {
                throw CurrentCountException;
            }
            if (query.To <= new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero) && PreviousCountException is not null)
            {
                BeforePreviousCountFailure?.Invoke();
                PreviousCountStarted?.TrySetResult();
                if (PreviousCountRelease is not null)
                {
                    await PreviousCountRelease.Task.WaitAsync(cancellationToken);
                }

                throw PreviousCountException;
            }
            if (FailPreviousCount && query.To <= new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero))
            {
                throw new VercelAnalyticsApiException(System.Net.HttpStatusCode.PaymentRequired);
            }

            CountStarted?.TrySetResult();
            if (CountRelease is not null)
            {
                await CountRelease.Task.WaitAsync(cancellationToken);
            }

            return new AnalyticsTotals(20, 10);
        }

        public Task<long> GetPageViewTotalAsync(VercelAnalyticsConnection connection, AnalyticsQuery query, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            PageViewTotalCalls++;
            if (query.To <= new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero) && PreviousPageViewTotalException is not null)
            {
                return Task.FromException<long>(PreviousPageViewTotalException);
            }
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
            EventDetailCalls.Add((eventName, eventDataFilter));
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
