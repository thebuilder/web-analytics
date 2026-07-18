using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class AnalyticsReportCacheTests
{
    [Fact]
    public async Task Requests_beyond_concurrent_capacity_are_rejected_without_queueing()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 10, maximumConcurrentRequests: 1);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = cache.GetOrCreateAsync("first", TimeSpan.FromMinutes(1), async () =>
        {
            started.SetResult();
            await release.Task;
            return "first";
        });

        await started.Task;
        await Assert.ThrowsAsync<AnalyticsReportCapacityException>(() =>
            cache.GetOrCreateAsync("second", TimeSpan.FromMinutes(1), () => Task.FromResult("second")));

        release.SetResult();
        Assert.Equal("first", await first);
        Assert.Equal(
            "second",
            await cache.GetOrCreateAsync("second", TimeSpan.FromMinutes(1), () => Task.FromResult("second")));
    }

    [Fact]
    public async Task Cache_evicts_entries_beyond_its_size_limit()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 1, maximumConcurrentRequests: 1);
        var calls = 0;

        Task<int> GetValue(string key) => cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(1), () =>
            Task.FromResult(Interlocked.Increment(ref calls)));

        await GetValue("first");
        await GetValue("second");
        await GetValue("second");

        Assert.Equal(3, calls);
    }
}
