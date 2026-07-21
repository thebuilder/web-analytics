using Microsoft.Extensions.Options;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Configuration;

public sealed class AnalyticsConnectionRegistry
{
    private readonly WebAnalyticsSettingsStore _settingsStore;
    private readonly IOptions<WebAnalyticsOptions> _serverOptions;
    private readonly bool _mockConnectionsEnabled;
    private readonly Lock _snapshotLock = new();
    private RegistrySnapshot? _snapshot;

    public AnalyticsConnectionRegistry(
        WebAnalyticsSettingsStore settingsStore,
        IOptions<WebAnalyticsOptions> serverOptions)
        : this(settingsStore, serverOptions, serverOptions.Value.EnableMockConnections)
    {
    }

    internal AnalyticsConnectionRegistry(
        WebAnalyticsSettingsStore settingsStore,
        IOptions<WebAnalyticsOptions> serverOptions,
        bool mockConnectionsEnabled)
    {
        _settingsStore = settingsStore;
        _serverOptions = serverOptions;
        _mockConnectionsEnabled = mockConnectionsEnabled;
    }

    public bool MockConnectionsEnabled => _mockConnectionsEnabled;

    public WebAnalyticsSettings Settings => Capture().Settings;

    public IEnumerable<AnalyticsConnection> Connections => Capture().Connections.Values;

    public AnalyticsConnection? Get(Guid key) =>
        Capture().Get(key);

    public AnalyticsConnection? FindNearestRoot(IEnumerable<Guid> ancestorKeys)
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

    private RegistrySnapshot CreateSnapshot(WebAnalyticsSettingsSnapshot settingsSnapshot)
    {
        var serverConfiguration = _serverOptions.Value;
        var connections = settingsSnapshot.Settings.Connections
            .Where(connection => !connection.IsMock || _mockConnectionsEnabled)
            .ToDictionary(
            connection => connection.Key,
            connection => AnalyticsConnection.Create(
                connection,
                ResolveAccessToken(
                    AnalyticsProviderCatalog.Default.Get(connection.Provider).GetAccessToken(serverConfiguration),
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
        WebAnalyticsSettings Settings,
        long Revision,
        IReadOnlyDictionary<Guid, AnalyticsConnection> Connections,
        IReadOnlyDictionary<Guid, Guid> RootOwners)
    {
        public AnalyticsConnection? Get(Guid key) => Connections.GetValueOrDefault(key);
    }
}

public sealed record AnalyticsConnection(
    Guid Key,
    string DisplayName,
    AnalyticsProvider Provider,
    string AccessToken,
    string ProjectId,
    string? Team,
    string SiteId,
    IReadOnlyList<string> EventPropertyNames,
    IReadOnlyList<Guid> DocumentRootKeys,
    bool EnableAllDocumentTypes,
    IReadOnlySet<Guid> EnabledDocumentTypeKeys,
    IReadOnlySet<string> EnabledDocumentTypes,
    MockAnalyticsScenario? MockScenario = null)
{
    public bool HasAccessToken => !string.IsNullOrWhiteSpace(AccessToken);

    public bool IsMock => MockScenario is not null;

    public bool IsConfigured => IsMock || HasAccessToken &&
        !string.IsNullOrWhiteSpace(AnalyticsProviderCatalog.Default.Get(Provider).GetIdentifier(this));

    public AnalyticsCapabilities Capabilities => IsMock
        ? AnalyticsProviderCatalog.Default.Get(AnalyticsProvider.Vercel).Capabilities
        : AnalyticsProviderCatalog.Default.Get(Provider).Capabilities;

    public override string ToString() =>
        $"{nameof(AnalyticsConnection)} {{ Key = {Key}, DisplayName = {DisplayName}, Provider = {Provider}, ProjectId = {ProjectId}, Team = {Team}, SiteId = {SiteId}, AccessToken = [REDACTED] }}";

    public bool IsDocumentTypeEnabled(string documentTypeAlias, Guid documentTypeKey) =>
        EnableAllDocumentTypes || EnabledDocumentTypeKeys.Contains(documentTypeKey) || EnabledDocumentTypes.Contains(documentTypeAlias);

    internal static AnalyticsConnection Create(
        AnalyticsConnectionSettings settings,
        string? accessToken) => new(
            settings.Key,
            string.IsNullOrWhiteSpace(settings.DisplayName)
                ? settings.Provider == AnalyticsProvider.Plausible ? settings.SiteId : settings.ProjectId
                : settings.DisplayName,
            settings.Provider,
            accessToken ?? string.Empty,
            settings.ProjectId,
            NullIfWhiteSpace(settings.Team),
            settings.SiteId,
            settings.EventPropertyNames,
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
