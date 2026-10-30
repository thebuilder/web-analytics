using System.Collections.Concurrent;

namespace TheBuilder.WebAnalytics.Services;

/// <summary>
/// Remembers which Plausible instances rejected engagement metrics, so later reports skip the failing
/// attempts for a while instead of paying for them on every request.
/// </summary>
public sealed class PlausibleMetricSupport(TimeProvider? timeProvider = null)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(1);
    private readonly TimeProvider _timeProvider = timeProvider ?? TimeProvider.System;
    private readonly ConcurrentDictionary<string, (Level Support, DateTimeOffset Until)> _instances = new();

    internal enum Level
    {
        None,
        Session,
        All
    }

    internal Level Get(string instance) =>
        _instances.TryGetValue(instance, out var known) && known.Until > _timeProvider.GetUtcNow()
            ? known.Support
            : Level.All;

    internal void Remember(string instance, Level support) =>
        _instances[instance] = (support, _timeProvider.GetUtcNow().Add(Lifetime));
}
