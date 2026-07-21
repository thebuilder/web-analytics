using TheBuilder.WebAnalytics.Configuration;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Services;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Tests.Configuration;

public sealed class WebAnalyticsSettingsValidatorTests
{
    private static readonly Guid MainKey = Guid.Parse("11111111-1111-1111-1111-111111111110");
    [Fact]
    public void Roots_are_optional_for_global_reports()
    {
        var settings = CreateSettings();

        Assert.Empty(WebAnalyticsSettingsValidator.Validate(settings));
    }

    [Fact]
    public void Enabled_analytics_does_not_require_a_connection()
    {
        var settings = CreateSettings();
        settings.Connections.Clear();

        Assert.Empty(WebAnalyticsSettingsValidator.Validate(settings));
    }

    [Fact]
    public void Duplicate_root_mappings_across_connections_are_rejected()
    {
        var settings = CreateSettings();
        settings.Connections[0].DocumentRootKeys = ["11111111-1111-1111-1111-111111111111"];
        settings.Connections.Add(new AnalyticsConnectionSettings
        {
            Key = Guid.Parse("22222222-2222-2222-2222-222222222220"),
            DisplayName = "Other",
            ProjectId = "other-project",
            DocumentRootKeys = ["11111111-1111-1111-1111-111111111111"]
        });

        var failures = WebAnalyticsSettingsValidator.Validate(settings);

        Assert.Contains(failures, failure => failure.Contains("assigned to both"));
    }

    [Fact]
    public void Document_type_keys_must_be_guids()
    {
        var settings = CreateSettings();
        settings.Connections[0].EnabledDocumentTypeKeys = ["not-a-guid"];

        var failures = WebAnalyticsSettingsValidator.Validate(settings);

        Assert.Contains(failures, failure => failure.Contains("invalid document type key"));
    }

    [Fact]
    public void All_document_types_does_not_require_explicit_selections()
    {
        var settings = CreateSettings();
        settings.Connections[0].EnableAllDocumentTypes = true;

        Assert.Empty(WebAnalyticsSettingsValidator.Validate(settings));
    }

    [Fact]
    public void Mock_scenarios_do_not_require_Vercel_connection_metadata()
    {
        var settings = CreateSettings();
        settings.Connections[0].ProjectId = string.Empty;
        settings.Connections[0].MockScenario = MockAnalyticsScenario.Flags;

        Assert.Empty(WebAnalyticsSettingsValidator.Validate(settings));
    }

    [Fact]
    public void Mock_scenarios_reject_Vercel_connection_metadata()
    {
        var settings = CreateSettings();
        settings.Connections[0].MockScenario = MockAnalyticsScenario.Events;
        settings.Connections[0].Team = "team_example";

        var failures = WebAnalyticsSettingsValidator.Validate(settings);

        Assert.Contains(failures, failure => failure.Contains("cannot define a Vercel project ID"));
        Assert.Contains(failures, failure => failure.Contains("cannot define a Vercel team"));
    }

    [Fact]
    public void Undefined_mock_scenarios_are_rejected_in_persisted_settings()
    {
        var settings = CreateSettings();
        settings.Connections[0].MockScenario = (MockAnalyticsScenario)999;

        var failures = WebAnalyticsSettingsValidator.Validate(settings);

        var failure = Assert.Single(failures);
        Assert.Contains("unsupported mock analytics scenario", failure);
    }

    [Fact]
    public void Undefined_mock_scenarios_do_not_skip_generic_connection_validation()
    {
        var settings = CreateSettings();
        settings.Connections[0].Key = Guid.Empty;
        settings.Connections[0].ProjectId = string.Empty;
        settings.Connections[0].MockScenario = (MockAnalyticsScenario)999;
        settings.Connections[0].DocumentRootKeys = ["not-a-guid"];
        settings.Connections[0].EnabledDocumentTypeKeys = ["not-a-guid"];

        var failures = WebAnalyticsSettingsValidator.Validate(settings);

        Assert.Contains(failures, failure => failure.Contains("unsupported mock analytics scenario"));
        Assert.Contains(failures, failure => failure.Contains("requires a valid key"));
        Assert.Contains(failures, failure => failure.Contains("requires a Vercel project ID"));
        Assert.Contains(failures, failure => failure.Contains("invalid document root key"));
        Assert.Contains(failures, failure => failure.Contains("invalid document type key"));
    }

    [Fact]
    public void Undefined_mock_scenarios_are_rejected_in_server_options()
    {
        var settings = CreateSettings();
        settings.Connections[0].MockScenario = (MockAnalyticsScenario)999;

        var failures = WebAnalyticsSettingsValidator.Validate(
            settings,
            WebAnalyticsValidationMode.ServerOptions);

        var failure = Assert.Single(failures);
        Assert.Contains("unsupported mock analytics scenario", failure);
    }

    [Theory]
    [InlineData(MockAnalyticsScenario.Complete)]
    [InlineData(MockAnalyticsScenario.Utm)]
    [InlineData(MockAnalyticsScenario.Flags)]
    [InlineData(MockAnalyticsScenario.Events)]
    public void Defined_mock_scenarios_remain_valid(MockAnalyticsScenario scenario)
    {
        var settings = CreateSettings();
        settings.Connections[0].ProjectId = string.Empty;
        settings.Connections[0].MockScenario = scenario;

        Assert.Empty(WebAnalyticsSettingsValidator.Validate(settings));
    }

    [Fact]
    public void Undefined_mock_scenarios_do_not_stop_other_connections_from_being_validated()
    {
        var settings = CreateSettings();
        settings.Connections[0].MockScenario = (MockAnalyticsScenario)999;
        settings.Connections.Add(new AnalyticsConnectionSettings
        {
            Key = Guid.Parse("22222222-2222-2222-2222-222222222220"),
            DisplayName = "Other",
            ProjectId = "other-project",
            EnabledDocumentTypeKeys = ["not-a-guid"]
        });

        var failures = WebAnalyticsSettingsValidator.Validate(settings);

        Assert.Contains(failures, failure => failure.Contains("unsupported mock analytics scenario"));
        Assert.Contains(failures, failure => failure.Contains("invalid document type key"));
    }

    [Fact]
    public void Store_preserves_mock_identity_without_Vercel_metadata()
    {
        var store = new WebAnalyticsSettingsStore(Options.Create(new WebAnalyticsOptions()));
        var settings = CreateSettings();
        settings.Connections[0].MockScenario = MockAnalyticsScenario.Utm;
        settings.Connections[0].Team = "team_example";

        store.Save(settings);
        var connection = Assert.Single(store.Get().Connections);

        Assert.Equal(MockAnalyticsScenario.Utm, connection.MockScenario);
        Assert.Equal("Mock · UTM campaigns", connection.DisplayName);
        Assert.Empty(connection.ProjectId);
        Assert.Null(connection.Team);
    }

    [Fact]
    public void Store_normalizes_non_secret_values_without_adding_a_token()
    {
        var store = new WebAnalyticsSettingsStore(Options.Create(new WebAnalyticsOptions()));
        var settings = CreateSettings();
        settings.Connections[0].DocumentRootKeys = ["11111111-1111-1111-1111-111111111111"];

        store.Save(settings);
        var connection = Assert.Single(store.Get().Connections);

        Assert.Equal("11111111-1111-1111-1111-111111111111", Assert.Single(connection.DocumentRootKeys));
        Assert.DoesNotContain("token", System.Text.Json.JsonSerializer.Serialize(connection), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Store_normalizes_plausible_event_property_names()
    {
        var store = new WebAnalyticsSettingsStore(Options.Create(new WebAnalyticsOptions()));
        var settings = CreateSettings();
        var connection = settings.Connections[0];
        connection.Provider = AnalyticsProvider.Plausible;
        connection.ProjectId = string.Empty;
        connection.SiteId = "example.com";
        connection.EventPropertyNames = [" locale ", "title", "LOCALE", ""];

        store.Save(settings);

        Assert.Equal(["locale", "title"], Assert.Single(store.Get().Connections).EventPropertyNames);
    }

    [Fact]
    public void Event_property_names_are_bounded_and_plausible_only()
    {
        var settings = CreateSettings();
        settings.Connections[0].EventPropertyNames = ["locale"];
        var vercelFailures = WebAnalyticsSettingsValidator.Validate(settings);

        settings.Connections[0].Provider = AnalyticsProvider.Plausible;
        settings.Connections[0].ProjectId = string.Empty;
        settings.Connections[0].SiteId = "example.com";
        settings.Connections[0].EventPropertyNames = Enumerable.Range(1, 21).Select(index => $"property-{index}").ToArray();
        var maximumFailures = WebAnalyticsSettingsValidator.Validate(settings);

        Assert.Contains(vercelFailures, failure => failure.Contains("cannot define event properties"));
        Assert.Contains(maximumFailures, failure => failure.Contains("cannot define more than 20 event properties"));
    }

    [Fact]
    public void Null_event_property_names_from_external_json_are_normalized()
    {
        var settings = CreateSettings();
        var connection = settings.Connections[0];
        connection.Provider = AnalyticsProvider.Plausible;
        connection.ProjectId = string.Empty;
        connection.SiteId = "example.com";
        connection.EventPropertyNames = null!;
        var store = new WebAnalyticsSettingsStore(Options.Create(new WebAnalyticsOptions()));

        store.Save(settings);

        Assert.Empty(Assert.Single(store.Get().Connections).EventPropertyNames);
    }

    [Fact]
    public void Store_generates_and_preserves_a_missing_connection_key()
    {
        var store = new WebAnalyticsSettingsStore(Options.Create(new WebAnalyticsOptions()));
        var settings = CreateSettings();
        settings.Connections[0].Key = Guid.Empty;

        store.Save(settings);
        var first = Assert.Single(store.Get().Connections).Key;
        var second = Assert.Single(store.Get().Connections).Key;

        Assert.NotEqual(Guid.Empty, first);
        Assert.Equal(first, second);
    }

    [Fact]
    public void Store_preserves_connection_order_from_server_options()
    {
        var secondKey = Guid.Parse("22222222-2222-2222-2222-222222222220");
        var options = new WebAnalyticsOptions
        {
            Enabled = true,
            Providers = { Vercel = { AccessToken = "server-secret" } },
            Connections =
            [
                new() { Key = MainKey, ProjectId = "first-project" },
                new() { Key = secondKey, ProjectId = "second-project" }
            ]
        };
        var store = new WebAnalyticsSettingsStore(Options.Create(options));

        Assert.Equal([MainKey, secondKey], store.Get().Connections.Select(connection => connection.Key));
    }

    [Fact]
    public void Store_observes_settings_saved_by_another_application_node()
    {
        var values = new FakeKeyValueService();
        var options = Options.Create(new WebAnalyticsOptions());
        var firstNode = new WebAnalyticsSettingsStore(values, options);
        var secondNode = new WebAnalyticsSettingsStore(values, options);
        var initial = CreateSettings();
        firstNode.Save(initial);
        var secondNodeInitialRevision = secondNode.GetSnapshot().Revision;

        Assert.Equal(firstNode.GetSnapshot().Revision, secondNodeInitialRevision);

        var changed = CreateSettings();
        changed.Connections[0].DisplayName = "Changed on another node";
        firstNode.Save(changed);
        var observed = secondNode.GetSnapshot();

        Assert.NotEqual(secondNodeInitialRevision, observed.Revision);
        Assert.Equal("Changed on another node", observed.Settings.Connections[0].DisplayName);
    }

    [Fact]
    public void Store_loads_and_roundtrips_legacy_vercel_settings_without_provider_or_credentials()
    {
        var values = new FakeKeyValueService();
        values.SetValue(StorageKey, LoadFixture("legacy-vercel-settings-v2.json"));
        var store = new WebAnalyticsSettingsStore(values, Options.Create(new WebAnalyticsOptions()));

        var loaded = store.Get();
        var connection = Assert.Single(loaded.Connections);

        Assert.True(loaded.Enabled);
        Assert.Equal(45, loaded.DefaultRangeDays);
        Assert.Equal(TimeSpan.FromMinutes(2), loaded.CacheDuration);
        Assert.Equal(MainKey, connection.Key);
        Assert.Equal(AnalyticsProvider.Vercel, connection.Provider);
        Assert.Equal("Legacy Vercel", connection.DisplayName);
        Assert.Equal("prj_legacy", connection.ProjectId);
        Assert.Equal("team_legacy", connection.Team);
        Assert.Equal(["11111111-1111-1111-1111-111111111111"], connection.DocumentRootKeys);
        Assert.True(connection.EnableAllDocumentTypes);
        Assert.Equal(["22222222-2222-2222-2222-222222222222"], connection.EnabledDocumentTypeKeys);
        Assert.Equal(["articlePage"], connection.EnabledDocumentTypes);

        store.Save(loaded);
        var serialized = values.GetValue(StorageKey);
        Assert.NotNull(serialized);
        Assert.DoesNotContain("token", serialized, StringComparison.OrdinalIgnoreCase);

        var reloaded = new WebAnalyticsSettingsStore(values, Options.Create(new WebAnalyticsOptions())).Get();
        var reloadedConnection = Assert.Single(reloaded.Connections);
        Assert.Equal(MainKey, reloadedConnection.Key);
        Assert.Equal(AnalyticsProvider.Vercel, reloadedConnection.Provider);
        Assert.Equal(connection.ProjectId, reloadedConnection.ProjectId);
        Assert.Equal(connection.Team, reloadedConnection.Team);
        Assert.Equal(connection.DocumentRootKeys, reloadedConnection.DocumentRootKeys);
        Assert.Equal(connection.EnabledDocumentTypeKeys, reloadedConnection.EnabledDocumentTypeKeys);
        Assert.Equal(connection.EnabledDocumentTypes, reloadedConnection.EnabledDocumentTypes);
    }

    private const string StorageKey = "TheBuilder.WebAnalytics.Settings.v2";

    private static string LoadFixture(string fileName) => File.ReadAllText(
        Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName));

    private static WebAnalyticsSettings CreateSettings() => new()
    {
        Enabled = true,
        Connections =
        [
            new AnalyticsConnectionSettings
            {
                Key = MainKey,
                DisplayName = "Main",
                ProjectId = "project"
            }
        ]
    };

    private sealed class FakeKeyValueService : IKeyValueService
    {
        private readonly Dictionary<string, string> _values = [];

        public string? GetValue(string key) => _values.GetValueOrDefault(key);

        public IReadOnlyDictionary<string, string?> FindByKeyPrefix(string keyPrefix) => _values
            .Where(pair => pair.Key.StartsWith(keyPrefix, StringComparison.Ordinal))
            .ToDictionary(pair => pair.Key, pair => (string?)pair.Value);

        public void SetValue(string key, string value) => _values[key] = value;

        public void SetValue(string key, string originValue, string newValue)
        {
            if (!TrySetValue(key, originValue, newValue))
            {
                throw new InvalidOperationException("The value changed before it could be updated.");
            }
        }

        public bool TrySetValue(string key, string originValue, string newValue)
        {
            if (!string.Equals(GetValue(key), originValue, StringComparison.Ordinal)) return false;
            _values[key] = newValue;
            return true;
        }
    }
}
