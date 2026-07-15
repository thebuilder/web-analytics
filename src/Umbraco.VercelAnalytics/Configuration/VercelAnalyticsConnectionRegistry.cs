using Microsoft.Extensions.Options;

namespace Umbraco.VercelAnalytics.Configuration;

public sealed class VercelAnalyticsConnectionRegistry
{
    private readonly IReadOnlyDictionary<string, VercelAnalyticsConnection> _connections;
    private readonly IReadOnlyDictionary<string, string> _hostnameOwners;
    private readonly IReadOnlyDictionary<Guid, string> _rootOwners;

    public VercelAnalyticsConnectionRegistry(IOptions<VercelAnalyticsOptions> options)
    {
        Options = options.Value;
        _connections = Options.Connections.ToDictionary(
            pair => pair.Key,
            pair => VercelAnalyticsConnection.Create(pair.Key, pair.Value),
            StringComparer.OrdinalIgnoreCase);
        _hostnameOwners = _connections.Values
            .SelectMany(connection => connection.Hostnames.Select(hostname => (hostname, connection.Alias)))
            .ToDictionary(pair => pair.hostname, pair => pair.Alias, StringComparer.OrdinalIgnoreCase);
        _rootOwners = _connections.Values
            .SelectMany(connection => connection.DocumentRootKeys.Select(rootKey => (rootKey, connection.Alias)))
            .ToDictionary(pair => pair.rootKey, pair => pair.Alias);
    }

    public VercelAnalyticsOptions Options { get; }

    public IEnumerable<VercelAnalyticsConnection> Connections => _connections.Values;

    public VercelAnalyticsConnection? Get(string alias) =>
        _connections.GetValueOrDefault(alias);

    public VercelAnalyticsConnection? FindByHostname(string? hostname)
    {
        var normalized = NormalizeHostname(hostname);
        return normalized is not null && _hostnameOwners.TryGetValue(normalized, out var alias)
            ? Get(alias)
            : null;
    }

    public VercelAnalyticsConnection? FindNearestRoot(IEnumerable<Guid> ancestorKeys)
    {
        foreach (var key in ancestorKeys)
        {
            if (_rootOwners.TryGetValue(key, out var alias)) return Get(alias);
        }

        return null;
    }

    public static string? NormalizeHostname(string? hostname)
    {
        if (string.IsNullOrWhiteSpace(hostname)) return null;
        var value = hostname.Trim().TrimEnd('.').ToLowerInvariant();
        return Uri.CheckHostName(value) == UriHostNameType.Unknown ? null : value;
    }
}

public sealed record VercelAnalyticsConnection(
    string Alias,
    string DisplayName,
    string AccessToken,
    string ProjectId,
    string? TeamId,
    string? TeamSlug,
    IReadOnlySet<string> Hostnames,
    IReadOnlyList<Guid> DocumentRootKeys,
    IReadOnlySet<string> EnabledDocumentTypes)
{
    internal static VercelAnalyticsConnection Create(string alias, VercelAnalyticsConnectionOptions options) =>
        new(
            alias,
            options.DisplayName.Trim(),
            options.AccessToken,
            options.ProjectId.Trim(),
            NullIfWhiteSpace(options.TeamId),
            NullIfWhiteSpace(options.TeamSlug),
            options.Hostnames.Select(VercelAnalyticsConnectionRegistry.NormalizeHostname).OfType<string>()
                .ToHashSet(StringComparer.OrdinalIgnoreCase),
            options.DocumentRootKeys.Select(Guid.Parse).ToArray(),
            options.EnabledDocumentTypes.Select(value => value.Trim()).Where(value => value.Length > 0)
                .ToHashSet(StringComparer.OrdinalIgnoreCase));

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
