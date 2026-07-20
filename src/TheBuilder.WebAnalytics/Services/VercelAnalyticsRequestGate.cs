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

    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);
        await _concurrency.WaitAsync(cancellationToken);

        try
        {
            return await operation(cancellationToken);
        }
        finally
        {
            _concurrency.Release();
        }
    }

    public void Dispose() => _concurrency.Dispose();
}
