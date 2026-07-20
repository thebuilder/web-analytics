using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class AnalyticsReportCacheTests
{
    private static readonly TimeSpan CoordinationTimeout = TimeSpan.FromSeconds(5);

    [Fact]
    public async Task Identical_inflight_requests_share_one_factory_and_result()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 10, maximumConcurrentRequests: 1);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;

        var requests = Enumerable.Range(0, 20)
            .Select(_ => cache.GetOrCreateAsync("summary", TimeSpan.FromMinutes(1), async cancellationToken =>
            {
                Interlocked.Increment(ref calls);
                started.SetResult();
                await release.Task.WaitAsync(cancellationToken);
                return 42;
            }, CancellationToken.None))
            .ToArray();

        await started.Task;
        Assert.Equal(1, Volatile.Read(ref calls));

        release.SetResult();
        Assert.All(await Task.WhenAll(requests), value => Assert.Equal(42, value));
    }

    [Fact]
    public async Task Different_inflight_keys_use_independent_capacity_slots()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 10, maximumConcurrentRequests: 2);
        var bothStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;

        Task<int> GetValue(string key) => cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(1), async cancellationToken =>
        {
            if (Interlocked.Increment(ref calls) == 2)
            {
                bothStarted.SetResult();
            }

            await release.Task.WaitAsync(cancellationToken);
            return 42;
        }, CancellationToken.None);

        var first = GetValue("first");
        var second = GetValue("second");

        await bothStarted.Task;
        Assert.Equal(2, Volatile.Read(ref calls));

        release.SetResult();
        var values = await Task.WhenAll(first, second);
        Assert.Equal([42, 42], values);
    }

    [Fact]
    public async Task Cancelling_one_waiter_does_not_cancel_the_shared_operation()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 10, maximumConcurrentRequests: 1);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        CancellationToken operationCancellationToken = default;
        using var firstCancellation = new CancellationTokenSource();

        var first = cache.GetOrCreateAsync("summary", TimeSpan.FromMinutes(1), async cancellationToken =>
        {
            operationCancellationToken = cancellationToken;
            started.SetResult();
            await release.Task.WaitAsync(cancellationToken);
            return 42;
        }, firstCancellation.Token);

        await started.Task;
        var second = cache.GetOrCreateAsync("summary", TimeSpan.FromMinutes(1), _ => Task.FromResult(0), CancellationToken.None);

        firstCancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        Assert.False(operationCancellationToken.IsCancellationRequested);

        release.SetResult();
        Assert.Equal(42, await second);
    }

    [Fact]
    public async Task Cancelling_all_waiters_allows_an_immediate_same_key_retry_and_preserves_retry_cancellation()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 10, maximumConcurrentRequests: 1);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var operationCancelled = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseCancelledOperation = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;
        using var firstCancellation = new CancellationTokenSource();
        using var secondCancellation = new CancellationTokenSource();
        using var retryCancellation = new CancellationTokenSource();

        Task<int> GetValue(CancellationToken cancellationToken) => cache.GetOrCreateAsync("summary", TimeSpan.FromMinutes(1), async operationToken =>
        {
            Interlocked.Increment(ref calls);
            started.SetResult();
            using var registration = operationToken.Register(operationCancelled.SetResult);
            await releaseCancelledOperation.Task;
            operationToken.ThrowIfCancellationRequested();
            return 1;
        }, cancellationToken);

        var first = GetValue(firstCancellation.Token);
        await started.Task;
        var second = GetValue(secondCancellation.Token);

        firstCancellation.Cancel();
        secondCancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => second);
        await operationCancelled.Task;

        var retry = cache.GetOrCreateAsync("summary", TimeSpan.FromMinutes(1), _ =>
        {
            Interlocked.Increment(ref calls);
            return Task.FromResult(2);
        }, CancellationToken.None);
        var cancelledRetry = cache.GetOrCreateAsync("summary", TimeSpan.FromMinutes(1), _ => Task.FromResult(3), retryCancellation.Token);

        retryCancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cancelledRetry);

        releaseCancelledOperation.SetResult();
        Assert.Equal(2, await retry);
        Assert.Equal(2, Volatile.Read(ref calls));
    }

    [Fact]
    public async Task Last_waiter_cancellation_at_operation_completion_never_uses_a_disposed_token_source()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 300, maximumConcurrentRequests: 1);

        for (var iteration = 0; iteration < 250; iteration++)
        {
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            using var firstCancellation = new CancellationTokenSource();
            using var lastCancellation = new CancellationTokenSource();
            var key = $"summary-{iteration}";

            var first = cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(1), async operationToken =>
            {
                started.SetResult();
                await release.Task.WaitAsync(operationToken);
                return 42;
            }, firstCancellation.Token);

            await started.Task.WaitAsync(CoordinationTimeout);
            var last = cache.GetOrCreateAsync(
                key,
                TimeSpan.FromMinutes(1),
                _ => Task.FromResult(0),
                lastCancellation.Token);

            firstCancellation.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first.WaitAsync(CoordinationTimeout));

            var startRace = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var completeOperation = CompleteOperationAsync();
            var cancelLastWaiter = CancelLastWaiterAsync();

            startRace.SetResult();
            await Task.WhenAll(completeOperation, cancelLastWaiter).WaitAsync(CoordinationTimeout);

            var exception = await Record.ExceptionAsync(() => last.WaitAsync(CoordinationTimeout));
            Assert.True(
                exception is null or OperationCanceledException,
                $"Expected success or caller cancellation, but received {exception?.GetType().Name}: {exception?.Message}");
            // Cross the cache boundary so the concurrency lease is released before the next iteration starts.
            await cache.GetOrCreateAsync(
                key,
                TimeSpan.FromMinutes(1),
                _ => Task.FromResult(0),
                CancellationToken.None).WaitAsync(CoordinationTimeout);

            async Task CompleteOperationAsync()
            {
                await startRace.Task;
                release.SetResult();
            }

            async Task CancelLastWaiterAsync()
            {
                await startRace.Task;
                lastCancellation.Cancel();
            }
        }
    }

    [Fact]
    public async Task Failed_operations_are_removed_before_a_later_retry()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 10, maximumConcurrentRequests: 1);
        var calls = 0;

        await Assert.ThrowsAsync<InvalidOperationException>(() => cache.GetOrCreateAsync("summary", TimeSpan.FromMinutes(1), _ =>
        {
            Interlocked.Increment(ref calls);
            return Task.FromException<int>(new InvalidOperationException());
        }, CancellationToken.None));

        Assert.Equal(42, await cache.GetOrCreateAsync("summary", TimeSpan.FromMinutes(1), _ =>
        {
            Interlocked.Increment(ref calls);
            return Task.FromResult(42);
        }, CancellationToken.None));
        Assert.Equal(2, Volatile.Read(ref calls));
    }

    [Fact]
    public async Task Requests_beyond_concurrent_capacity_are_rejected_without_queueing()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 10, maximumConcurrentRequests: 1);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = cache.GetOrCreateAsync("first", TimeSpan.FromMinutes(1), async cancellationToken =>
        {
            started.SetResult();
            await release.Task.WaitAsync(cancellationToken);
            return "first";
        }, CancellationToken.None);

        await started.Task;
        await Assert.ThrowsAsync<AnalyticsReportCapacityException>(() =>
            cache.GetOrCreateAsync("second", TimeSpan.FromMinutes(1), _ => Task.FromResult("second"), CancellationToken.None));

        release.SetResult();
        Assert.Equal("first", await first);
        Assert.Equal(
            "second",
            await cache.GetOrCreateAsync("second", TimeSpan.FromMinutes(1), _ => Task.FromResult("second"), CancellationToken.None));
    }

    [Fact]
    public async Task Cache_evicts_entries_beyond_its_size_limit()
    {
        using var cache = new AnalyticsReportCache(maximumEntries: 1, maximumConcurrentRequests: 1);
        var calls = 0;

        Task<int> GetValue(string key) => cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(1), _ =>
            Task.FromResult(Interlocked.Increment(ref calls)), CancellationToken.None);

        await GetValue("first");
        await GetValue("second");
        await GetValue("second");

        Assert.Equal(3, calls);
    }
}
