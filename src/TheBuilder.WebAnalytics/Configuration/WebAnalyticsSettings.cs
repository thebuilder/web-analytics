using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Umbraco.Cms.Core.Services;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Configuration;

public sealed class WebAnalyticsSettings
{
    public bool Enabled { get; set; } = true;

    public int DefaultRangeDays { get; set; } = 30;

    public TimeSpan CacheDuration { get; set; } = TimeSpan.FromMinutes(5);

    public List<AnalyticsConnectionSettings> Connections { get; set; } = [];
}

public sealed class AnalyticsConnectionSettings
{
    public Guid Key { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public AnalyticsProvider Provider { get; set; } = AnalyticsProvider.Vercel;

    public string ProjectId { get; set; } = string.Empty;

    public string? Team { get; set; }

    public string SiteId { get; set; } = string.Empty;

    public string[] EventPropertyNames { get; set; } = [];

    public MockAnalyticsScenario? MockScenario { get; set; }

    [JsonIgnore]
    public bool IsMock => MockScenario is not null;

    public string[] DocumentRootKeys { get; set; } = [];

    public bool EnableAllDocumentTypes { get; set; }

    public string[] EnabledDocumentTypeKeys { get; set; } = [];

    // Supports document-type aliases in configuration-only bootstrapping.
    public string[] EnabledDocumentTypes { get; set; } = [];
}

public sealed class WebAnalyticsSettingsStore
{
    private const string StorageKey = "TheBuilder.WebAnalytics.Settings.v2";
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    private readonly Lock _lock = new();
    private readonly IKeyValueService? _keyValueService;
    private readonly Microsoft.Extensions.Options.IOptions<WebAnalyticsOptions> _serverOptions;
    private WebAnalyticsSettings? _cached;
    private string? _cachedJson;
    private long _revision;

    public WebAnalyticsSettingsStore(
        IKeyValueService keyValueService,
        Microsoft.Extensions.Options.IOptions<WebAnalyticsOptions> serverOptions)
    {
        _keyValueService = keyValueService;
        _serverOptions = serverOptions;
    }

    public WebAnalyticsSettingsStore(
        Microsoft.Extensions.Options.IOptions<WebAnalyticsOptions> serverOptions)
    {
        _serverOptions = serverOptions;
    }

    public WebAnalyticsSettings Get() => GetSnapshot().Settings;

    internal WebAnalyticsSettingsSnapshot GetSnapshot()
    {
        lock (_lock)
        {
            var json = _keyValueService?.GetValue(StorageKey);
            if (_cached is null || (_keyValueService is not null && !string.Equals(json, _cachedJson, StringComparison.Ordinal)))
            {
                var settings = string.IsNullOrWhiteSpace(json)
                    ? WebAnalyticsSettingsMapper.FromServerOptions(_serverOptions.Value)
                    : JsonSerializer.Deserialize<WebAnalyticsSettings>(json, SerializerOptions)
                        ?? WebAnalyticsSettingsMapper.FromServerOptions(_serverOptions.Value);
                _cached = Normalize(settings);
                _cachedJson = JsonSerializer.Serialize(_cached, SerializerOptions);
                if (string.IsNullOrWhiteSpace(json)) _keyValueService?.SetValue(StorageKey, _cachedJson);
                _revision = ComputeRevision(_cachedJson);
            }

            return new WebAnalyticsSettingsSnapshot(_cached, _revision);
        }
    }

    public void Save(WebAnalyticsSettings settings)
    {
        var normalized = Normalize(settings);
        var json = JsonSerializer.Serialize(normalized, SerializerOptions);
        lock (_lock)
        {
            _keyValueService?.SetValue(StorageKey, json);
            _cached = normalized;
            _cachedJson = json;
            _revision = ComputeRevision(json);
        }
    }

    private static WebAnalyticsSettings Normalize(WebAnalyticsSettings settings) => new()
    {
        Enabled = settings.Enabled,
        DefaultRangeDays = settings.DefaultRangeDays,
        CacheDuration = settings.CacheDuration,
        Connections = settings.Connections.Select(NormalizeConnection).ToList()
    };

    private static AnalyticsConnectionSettings NormalizeConnection(AnalyticsConnectionSettings connection)
    {
        var definition = AnalyticsProviderCatalog.Default.Get(connection.Provider);
        var fields = definition.Normalize(connection);
        return new AnalyticsConnectionSettings
        {
            Key = connection.Key == Guid.Empty ? Guid.NewGuid() : connection.Key,
            Provider = connection.Provider,
            DisplayName = connection.MockScenario is { } scenario
                ? MockAnalyticsScenarioMetadata.DisplayName(scenario)
                : connection.DisplayName.Trim(),
            ProjectId = fields.ProjectId,
            Team = fields.Team,
            SiteId = fields.SiteId,
            EventPropertyNames = fields.EventPropertyNames,
            MockScenario = connection.MockScenario,
            DocumentRootKeys = NormalizeGuidValues(connection.DocumentRootKeys),
            EnableAllDocumentTypes = connection.EnableAllDocumentTypes,
            EnabledDocumentTypeKeys = NormalizeGuidValues(connection.EnabledDocumentTypeKeys),
            EnabledDocumentTypes = connection.EnabledDocumentTypes
                .Select(value => value.Trim())
                .Where(value => value.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray()
        };
    }

    private static long ComputeRevision(string json) =>
        BinaryPrimitives.ReadInt64LittleEndian(SHA256.HashData(Encoding.UTF8.GetBytes(json))) & long.MaxValue;

    private static string[] NormalizeGuidValues(IEnumerable<string> values) => values
        .Select(value => Guid.TryParse(value, out var parsed) ? parsed.ToString() : null)
        .OfType<string>()
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

}

internal sealed record WebAnalyticsSettingsSnapshot(
    WebAnalyticsSettings Settings,
    long Revision);

internal static class WebAnalyticsSettingsMapper
{
    public static WebAnalyticsSettings FromServerOptions(WebAnalyticsOptions options)
    {
        var connections = options.Connections.Select(connection => new AnalyticsConnectionSettings
        {
            Key = connection.Key == Guid.Empty ? Guid.NewGuid() : connection.Key,
            Provider = connection.Provider,
            DisplayName = connection.DisplayName,
            ProjectId = connection.ProjectId,
            Team = connection.Team,
            SiteId = connection.SiteId,
            EventPropertyNames = connection.EventPropertyNames,
            MockScenario = connection.MockScenario,
            DocumentRootKeys = connection.DocumentRootKeys,
            EnableAllDocumentTypes = connection.EnableAllDocumentTypes,
            EnabledDocumentTypeKeys = connection.EnabledDocumentTypeKeys,
            EnabledDocumentTypes = connection.EnabledDocumentTypes
        }).ToList();
        return new WebAnalyticsSettings
        {
            Enabled = options.Enabled,
            DefaultRangeDays = options.DefaultRangeDays,
            CacheDuration = options.CacheDuration,
            Connections = connections
        };
    }
}
