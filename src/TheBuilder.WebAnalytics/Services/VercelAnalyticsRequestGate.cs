namespace TheBuilder.WebAnalytics.Services;

public sealed class VercelAnalyticsRequestGate : IDisposable
{
    internal const int DefaultMaximumConcurrentRequests = 8;

    private readonly SemaphoreSlim _concurrency;

    public VercelAnalyticsRequestGate()
        : this(DefaultMaximumConcurrentRequests)
    {
    }

    internal VercelAnalyticsRequestGate(int maximumConcurrentRequests)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maximumConcurrentRequests);
        _concurrency = new SemaphoreSlim(maximumConcurrentRequests, maximumConcurrentRequests);
    }

    public async Task<T> RunAsync<T>(Func<Task<T>> operation)
    {
        ArgumentNullException.ThrowIfNull(operation);
        if (!await _concurrency.WaitAsync(TimeSpan.Zero))
        {
            throw new AnalyticsReportCapacityException();
        }

        try
        {
            return await operation();
        }
        finally
        {
            _concurrency.Release();
        }
    }

    public void Dispose() => _concurrency.Dispose();
}
