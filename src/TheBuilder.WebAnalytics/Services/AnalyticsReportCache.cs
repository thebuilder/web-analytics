using Microsoft.Extensions.Caching.Memory;

namespace TheBuilder.WebAnalytics.Services;

public sealed class AnalyticsReportCache : IDisposable
{
    internal const int DefaultMaximumEntries = 500;
    internal const int DefaultMaximumConcurrentRequests = 8;

    private readonly MemoryCache _cache;
    private readonly SemaphoreSlim _concurrency;
    private readonly Dictionary<string, InflightOperation> _inflight = [];
    private readonly object _inflightLock = new();
    public AnalyticsReportCache()
        : this(DefaultMaximumEntries, DefaultMaximumConcurrentRequests)
    {
    }

    internal AnalyticsReportCache(int maximumEntries, int maximumConcurrentRequests)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maximumEntries);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maximumConcurrentRequests);
        _cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = maximumEntries });
        _concurrency = new SemaphoreSlim(maximumConcurrentRequests, maximumConcurrentRequests);
    }

    public async Task<T> GetOrCreateAsync<T>(
        string key,
        TimeSpan duration,
        Func<CancellationToken, Task<T>> factory,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(factory);
        cancellationToken.ThrowIfCancellationRequested();

        if (duration <= TimeSpan.Zero)
        {
            return await RunBoundedAsync(() => factory(cancellationToken));
        }

        if (_cache.TryGetValue(key, out T? cached))
        {
            return cached!;
        }

        InflightOperation operation;
        lock (_inflightLock)
        {
            if (_cache.TryGetValue(key, out cached))
            {
                return cached!;
            }

            if (!_inflight.TryGetValue(key, out operation!) || operation.Cancellation.IsCancellationRequested)
            {
                operation = new InflightOperation(typeof(T));
                operation.Task = new Lazy<Task<object?>>(() => CreateAsync(key, duration, factory, operation));
                _inflight[key] = operation;
            }

            if (operation.ValueType != typeof(T))
            {
                throw new InvalidOperationException($"The report cache key '{key}' is already in use for {operation.ValueType.Name}.");
            }

            operation.Waiters++;
            _ = operation.Task!.Value;
        }

        try
        {
            return (T)(await operation.Task!.Value.WaitAsync(cancellationToken))!;
        }
        finally
        {
            ReleaseWaiter(operation);
        }
    }

    public void Dispose()
    {
        _cache.Dispose();
        _concurrency.Dispose();
    }

    private async Task<object?> CreateAsync<T>(
        string key,
        TimeSpan duration,
        Func<CancellationToken, Task<T>> factory,
        InflightOperation operation)
    {
        try
        {
            var value = await RunBoundedAsync(() => factory(operation.Cancellation.Token));
            _cache.Set(key, value, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = duration,
                Size = 1
            });
            return value;
        }
        finally
        {
            lock (_inflightLock)
            {
                if (_inflight.GetValueOrDefault(key) == operation)
                {
                    _inflight.Remove(key);
                }
            }

            operation.Cancellation.Dispose();
        }
    }

    private async Task<T> RunBoundedAsync<T>(Func<Task<T>> factory)
    {
        if (!await _concurrency.WaitAsync(TimeSpan.Zero))
        {
            throw new AnalyticsReportCapacityException();
        }

        try
        {
            return await factory();
        }
        finally
        {
            _concurrency.Release();
        }
    }

    private void ReleaseWaiter(InflightOperation operation)
    {
        lock (_inflightLock)
        {
            operation.Waiters--;
            if (operation.Waiters == 0 && !operation.Task!.Value.IsCompleted)
            {
                operation.Cancellation.Cancel();
            }
        }
    }

    private sealed class InflightOperation(Type valueType)
    {
        public Type ValueType { get; } = valueType;
        public CancellationTokenSource Cancellation { get; } = new();
        public Lazy<Task<object?>>? Task { get; set; }
        public int Waiters { get; set; }
    }
}

public sealed class AnalyticsReportCapacityException : Exception
{
}
