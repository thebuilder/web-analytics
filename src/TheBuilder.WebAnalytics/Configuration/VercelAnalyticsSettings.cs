using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Umbraco.Cms.Core.Services;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Configuration;

public sealed class VercelAnalyticsSettings
{
    public bool Enabled { get; set; } = true;

    public int DefaultRangeDays { get; set; } = 30;

    public TimeSpan CacheDuration { get; set; } = TimeSpan.FromMinutes(5);

    public List<VercelAnalyticsConnectionSettings> Connections { get; set; } = [];
}

public sealed class VercelAnalyticsConnectionSettings
{
    public Guid Key { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string ProjectId { get; set; } = string.Empty;

    public string? Team { get; set; }

    public MockAnalyticsScenario? MockScenario { get; set; }

    [JsonIgnore]
    public bool IsMock => MockScenario is not null;

    public string[] DocumentRootKeys { get; set; } = [];

    public bool EnableAllDocumentTypes { get; set; }

    public string[] EnabledDocumentTypeKeys { get; set; } = [];

    // Supports document-type aliases in configuration-only bootstrapping.
    public string[] EnabledDocumentTypes { get; set; } = [];
}

public sealed class VercelAnalyticsSettingsStore
{
    private const string StorageKey = "TheBuilder.WebAnalytics.Settings.v2";
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    private readonly Lock _lock = new();
    private readonly IKeyValueService? _keyValueService;
    private readonly Microsoft.Extensions.Options.IOptions<VercelAnalyticsOptions> _serverOptions;
    private VercelAnalyticsSettings? _cached;
    private string? _cachedJson;
    private long _revision;

    public VercelAnalyticsSettingsStore(
        IKeyValueService keyValueService,
        Microsoft.Extensions.Options.IOptions<VercelAnalyticsOptions> serverOptions)
    {
        _keyValueService = keyValueService;
        _serverOptions = serverOptions;
    }

    public VercelAnalyticsSettingsStore(
        Microsoft.Extensions.Options.IOptions<VercelAnalyticsOptions> serverOptions)
    {
        _serverOptions = serverOptions;
    }

    public VercelAnalyticsSettings Get() => GetSnapshot().Settings;

    internal VercelAnalyticsSettingsSnapshot GetSnapshot()
    {
        lock (_lock)
        {
            var json = _keyValueService?.GetValue(StorageKey);
            if (_cached is null || (_keyValueService is not null && !string.Equals(json, _cachedJson, StringComparison.Ordinal)))
            {
                var settings = string.IsNullOrWhiteSpace(json)
                    ? VercelAnalyticsSettingsMapper.FromServerOptions(_serverOptions.Value)
                    : JsonSerializer.Deserialize<VercelAnalyticsSettings>(json, SerializerOptions)
                        ?? VercelAnalyticsSettingsMapper.FromServerOptions(_serverOptions.Value);
                _cached = Normalize(settings);
                _cachedJson = JsonSerializer.Serialize(_cached, SerializerOptions);
                if (string.IsNullOrWhiteSpace(json)) _keyValueService?.SetValue(StorageKey, _cachedJson);
                _revision = ComputeRevision(_cachedJson);
            }

            return new VercelAnalyticsSettingsSnapshot(_cached, _revision);
        }
    }

    public void Save(VercelAnalyticsSettings settings)
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

    private static VercelAnalyticsSettings Normalize(VercelAnalyticsSettings settings) => new()
    {
        Enabled = settings.Enabled,
        DefaultRangeDays = settings.DefaultRangeDays,
        CacheDuration = settings.CacheDuration,
        Connections = settings.Connections.Select(connection => new VercelAnalyticsConnectionSettings
        {
            Key = connection.Key == Guid.Empty ? Guid.NewGuid() : connection.Key,
            DisplayName = connection.MockScenario is { } scenario
                ? MockAnalyticsScenarioMetadata.DisplayName(scenario)
                : connection.DisplayName.Trim(),
            ProjectId = connection.IsMock ? string.Empty : connection.ProjectId.Trim(),
            Team = connection.IsMock ? null : NullIfWhiteSpace(connection.Team),
            MockScenario = connection.MockScenario,
            DocumentRootKeys = NormalizeGuidValues(connection.DocumentRootKeys),
            EnableAllDocumentTypes = connection.EnableAllDocumentTypes,
            EnabledDocumentTypeKeys = NormalizeGuidValues(connection.EnabledDocumentTypeKeys),
            EnabledDocumentTypes = connection.EnabledDocumentTypes
                .Select(value => value.Trim())
                .Where(value => value.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray()
        }).ToList()
    };

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static long ComputeRevision(string json) =>
        BinaryPrimitives.ReadInt64LittleEndian(SHA256.HashData(Encoding.UTF8.GetBytes(json))) & long.MaxValue;

    private static string[] NormalizeGuidValues(IEnumerable<string> values) => values
        .Select(value => Guid.TryParse(value, out var parsed) ? parsed.ToString() : null)
        .OfType<string>()
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();
}

internal sealed record VercelAnalyticsSettingsSnapshot(
    VercelAnalyticsSettings Settings,
    long Revision);

internal static class VercelAnalyticsSettingsMapper
{
    public static VercelAnalyticsSettings FromServerOptions(VercelAnalyticsOptions options)
    {
        var connections = options.Connections.Select(connection => new VercelAnalyticsConnectionSettings
        {
            Key = connection.Key == Guid.Empty ? Guid.NewGuid() : connection.Key,
            DisplayName = connection.DisplayName,
            ProjectId = connection.ProjectId,
            Team = connection.Team,
            MockScenario = connection.MockScenario,
            DocumentRootKeys = connection.DocumentRootKeys,
            EnableAllDocumentTypes = connection.EnableAllDocumentTypes,
            EnabledDocumentTypeKeys = connection.EnabledDocumentTypeKeys,
            EnabledDocumentTypes = connection.EnabledDocumentTypes
        }).ToList();
        return new VercelAnalyticsSettings
        {
            Enabled = options.Enabled,
            DefaultRangeDays = options.DefaultRangeDays,
            CacheDuration = options.CacheDuration,
            Connections = connections
        };
    }
}
