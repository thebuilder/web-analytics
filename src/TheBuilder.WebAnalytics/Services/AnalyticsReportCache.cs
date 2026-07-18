using Microsoft.Extensions.Caching.Memory;

namespace TheBuilder.WebAnalytics.Services;

public sealed class AnalyticsReportCache : IDisposable
{
    internal const int DefaultMaximumEntries = 500;
    internal const int DefaultMaximumConcurrentRequests = 8;

    private readonly MemoryCache _cache;
    private readonly SemaphoreSlim _concurrency;
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

    public async Task<T> GetOrCreateAsync<T>(string key, TimeSpan duration, Func<Task<T>> factory)
    {
        if (duration <= TimeSpan.Zero)
        {
            return await RunBoundedAsync(factory);
        }

        if (_cache.TryGetValue(key, out T? cached))
        {
            return cached!;
        }

        return (T)await CreateAsync(key, duration, factory);
    }

    public void Dispose()
    {
        _cache.Dispose();
        _concurrency.Dispose();
    }

    private async Task<object> CreateAsync<T>(string key, TimeSpan duration, Func<Task<T>> factory)
    {
        var value = await RunBoundedAsync(factory);
        _cache.Set(key, value, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = duration,
            Size = 1
        });
        return value!;
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
}

public sealed class AnalyticsReportCapacityException : Exception
{
}
