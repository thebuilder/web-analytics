using Microsoft.Extensions.Options;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Configuration;

public sealed class VercelAnalyticsConnectionRegistry
{
    private readonly VercelAnalyticsSettingsStore _settingsStore;
    private readonly IOptions<VercelAnalyticsOptions> _serverOptions;
    private readonly bool _mockConnectionsEnabled;
    private readonly Lock _snapshotLock = new();
    private RegistrySnapshot? _snapshot;

    public VercelAnalyticsConnectionRegistry(
        VercelAnalyticsSettingsStore settingsStore,
        IOptions<VercelAnalyticsOptions> serverOptions)
        : this(settingsStore, serverOptions, serverOptions.Value.EnableMockConnections)
    {
    }

    public VercelAnalyticsConnectionRegistry(IOptions<VercelAnalyticsOptions> serverOptions)
        : this(new VercelAnalyticsSettingsStore(serverOptions), serverOptions, false)
    {
    }

    internal VercelAnalyticsConnectionRegistry(
        VercelAnalyticsSettingsStore settingsStore,
        IOptions<VercelAnalyticsOptions> serverOptions,
        bool mockConnectionsEnabled)
    {
        _settingsStore = settingsStore;
        _serverOptions = serverOptions;
        _mockConnectionsEnabled = mockConnectionsEnabled;
    }

    public bool MockConnectionsEnabled => _mockConnectionsEnabled;

    public VercelAnalyticsSettings Settings => Capture().Settings;

    public IEnumerable<VercelAnalyticsConnection> Connections => Capture().Connections.Values;

    public VercelAnalyticsConnection? Get(Guid key) =>
        Capture().Get(key);

    public VercelAnalyticsConnection? FindNearestRoot(IEnumerable<Guid> ancestorKeys)
    {
        var snapshot = Capture();
        foreach (var key in ancestorKeys)
        {
            if (snapshot.RootOwners.TryGetValue(key, out var connectionKey))
            {
                return snapshot.Connections.GetValueOrDefault(connectionKey);
            }
        }

        return null;
    }

    internal RegistrySnapshot Capture()
    {
        var settingsSnapshot = _settingsStore.GetSnapshot();
        lock (_snapshotLock)
        {
            if (_snapshot?.Revision == settingsSnapshot.Revision)
            {
                return _snapshot;
            }

            _snapshot = CreateSnapshot(settingsSnapshot);
            return _snapshot;
        }
    }

    private RegistrySnapshot CreateSnapshot(VercelAnalyticsSettingsSnapshot settingsSnapshot)
    {
        var serverConfiguration = _serverOptions.Value;
        var connections = settingsSnapshot.Settings.Connections
            .Where(connection => !connection.IsMock || _mockConnectionsEnabled)
            .ToDictionary(
            connection => connection.Key,
            connection => VercelAnalyticsConnection.Create(
                connection,
                ResolveAccessToken(
                    serverConfiguration.AccessToken,
                    serverConfiguration.ConnectionAccessTokens.GetValueOrDefault(connection.Key.ToString()))));
        var roots = connections.Values
            .SelectMany(connection => connection.DocumentRootKeys.Select(rootKey => (rootKey, connection.Key)))
            .ToDictionary(pair => pair.rootKey, pair => pair.Key);
        return new RegistrySnapshot(
            settingsSnapshot.Settings,
            settingsSnapshot.Revision,
            connections,
            roots);
    }

    private static string ResolveAccessToken(string? sharedAccessToken, string? connectionAccessToken) =>
        !string.IsNullOrWhiteSpace(connectionAccessToken)
            ? connectionAccessToken
            : sharedAccessToken ?? string.Empty;

    internal sealed record RegistrySnapshot(
        VercelAnalyticsSettings Settings,
        long Revision,
        IReadOnlyDictionary<Guid, VercelAnalyticsConnection> Connections,
        IReadOnlyDictionary<Guid, Guid> RootOwners)
    {
        public VercelAnalyticsConnection? Get(Guid key) => Connections.GetValueOrDefault(key);
    }
}

public sealed record VercelAnalyticsConnection(
    Guid Key,
    string DisplayName,
    string AccessToken,
    string ProjectId,
    string? Team,
    IReadOnlyList<Guid> DocumentRootKeys,
    bool EnableAllDocumentTypes,
    IReadOnlySet<Guid> EnabledDocumentTypeKeys,
    IReadOnlySet<string> EnabledDocumentTypes,
    MockAnalyticsScenario? MockScenario = null)
{
    public bool HasAccessToken => !string.IsNullOrWhiteSpace(AccessToken);

    public bool IsMock => MockScenario is not null;

    public bool IsConfigured => IsMock || HasAccessToken && !string.IsNullOrWhiteSpace(ProjectId);

    public override string ToString() =>
        $"{nameof(VercelAnalyticsConnection)} {{ Key = {Key}, DisplayName = {DisplayName}, ProjectId = {ProjectId}, Team = {Team}, AccessToken = [REDACTED] }}";

    public bool IsDocumentTypeEnabled(string documentTypeAlias, Guid documentTypeKey) =>
        EnableAllDocumentTypes || EnabledDocumentTypeKeys.Contains(documentTypeKey) || EnabledDocumentTypes.Contains(documentTypeAlias);

    internal static VercelAnalyticsConnection Create(
        VercelAnalyticsConnectionSettings settings,
        string? accessToken) => new(
            settings.Key,
            string.IsNullOrWhiteSpace(settings.DisplayName) ? settings.ProjectId : settings.DisplayName,
            accessToken ?? string.Empty,
            settings.ProjectId,
            NullIfWhiteSpace(settings.Team),
            ParseGuidValues(settings.DocumentRootKeys),
            settings.EnableAllDocumentTypes,
            ParseGuidValues(settings.EnabledDocumentTypeKeys).ToHashSet(),
            settings.EnabledDocumentTypes.Select(value => value.Trim()).Where(value => value.Length > 0)
                .ToHashSet(StringComparer.OrdinalIgnoreCase),
            settings.MockScenario);

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static IReadOnlyList<Guid> ParseGuidValues(IEnumerable<string> values) => values
        .Select(value => Guid.TryParse(value, out var parsed) ? parsed : (Guid?)null)
        .OfType<Guid>()
        .ToArray();
}
