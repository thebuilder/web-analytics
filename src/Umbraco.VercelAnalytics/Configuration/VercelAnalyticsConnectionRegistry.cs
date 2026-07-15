using Microsoft.Extensions.Options;

namespace Umbraco.VercelAnalytics.Configuration;

public sealed class VercelAnalyticsConnectionRegistry(
    VercelAnalyticsSettingsStore settingsStore,
    IOptions<VercelAnalyticsOptions> serverOptions)
{
    public VercelAnalyticsConnectionRegistry(IOptions<VercelAnalyticsOptions> serverOptions)
        : this(new VercelAnalyticsSettingsStore(serverOptions), serverOptions)
    {
    }

    public VercelAnalyticsSettings Settings => settingsStore.Get();

    public long SettingsRevision => settingsStore.Revision;

    public IEnumerable<VercelAnalyticsConnection> Connections => CreateSnapshot().Connections.Values;

    public VercelAnalyticsConnection? Get(string alias) =>
        CreateSnapshot().Connections.GetValueOrDefault(alias);

    public VercelAnalyticsConnection? FindByHostname(string? hostname)
    {
        var normalized = NormalizeHostname(hostname);
        if (normalized is null) return null;
        var snapshot = CreateSnapshot();
        return snapshot.HostnameOwners.TryGetValue(normalized, out var alias)
            ? snapshot.Connections.GetValueOrDefault(alias)
            : null;
    }

    public VercelAnalyticsConnection? FindNearestRoot(IEnumerable<Guid> ancestorKeys)
    {
        var snapshot = CreateSnapshot();
        foreach (var key in ancestorKeys)
        {
            if (snapshot.RootOwners.TryGetValue(key, out var alias))
            {
                return snapshot.Connections.GetValueOrDefault(alias);
            }
        }

        return null;
    }

    public static string? NormalizeHostname(string? hostname)
    {
        if (string.IsNullOrWhiteSpace(hostname)) return null;
        var value = hostname.Trim().TrimEnd('.').ToLowerInvariant();
        return Uri.CheckHostName(value) == UriHostNameType.Unknown ? null : value;
    }

    private RegistrySnapshot CreateSnapshot()
    {
        var configuredTokens = serverOptions.Value.Connections;
        var connections = Settings.Connections.ToDictionary(
            connection => connection.Alias,
            connection => VercelAnalyticsConnection.Create(
                connection,
                configuredTokens.GetValueOrDefault(connection.Alias)?.AccessToken),
            StringComparer.OrdinalIgnoreCase);
        var hostnames = connections.Values
            .SelectMany(connection => connection.Hostnames.Select(hostname => (hostname, connection.Alias)))
            .ToDictionary(pair => pair.hostname, pair => pair.Alias, StringComparer.OrdinalIgnoreCase);
        var roots = connections.Values
            .SelectMany(connection => connection.DocumentRootKeys.Select(rootKey => (rootKey, connection.Alias)))
            .ToDictionary(pair => pair.rootKey, pair => pair.Alias);
        return new RegistrySnapshot(connections, hostnames, roots);
    }

    private sealed record RegistrySnapshot(
        IReadOnlyDictionary<string, VercelAnalyticsConnection> Connections,
        IReadOnlyDictionary<string, string> HostnameOwners,
        IReadOnlyDictionary<Guid, string> RootOwners);
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
    bool EnableAllDocumentTypes,
    IReadOnlySet<Guid> EnabledDocumentTypeKeys,
    IReadOnlySet<string> EnabledDocumentTypes)
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccessToken) && !string.IsNullOrWhiteSpace(ProjectId);

    public bool HasMappings => Hostnames.Count > 0 || DocumentRootKeys.Count > 0;

    public bool IsDocumentTypeEnabled(string alias, Guid key) =>
        EnableAllDocumentTypes || EnabledDocumentTypeKeys.Contains(key) || EnabledDocumentTypes.Contains(alias);

    internal static VercelAnalyticsConnection Create(
        VercelAnalyticsConnectionSettings settings,
        string? accessToken) => new(
            settings.Alias,
            settings.DisplayName,
            accessToken ?? string.Empty,
            settings.ProjectId,
            NullIfWhiteSpace(settings.TeamId),
            NullIfWhiteSpace(settings.TeamSlug),
            settings.Hostnames.Select(VercelAnalyticsConnectionRegistry.NormalizeHostname).OfType<string>()
                .ToHashSet(StringComparer.OrdinalIgnoreCase),
            settings.DocumentRootKeys.Select(Guid.Parse).ToArray(),
            settings.EnableAllDocumentTypes,
            settings.EnabledDocumentTypeKeys.Select(Guid.Parse).ToHashSet(),
            settings.EnabledDocumentTypes.Select(value => value.Trim()).Where(value => value.Length > 0)
                .ToHashSet(StringComparer.OrdinalIgnoreCase));

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
