using Microsoft.Extensions.Options;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Tests.Configuration;

public sealed class WebAnalyticsOptionsValidatorTests
{
    private static readonly Guid MainKey = Guid.Parse("11111111-1111-1111-1111-111111111110");
    private static readonly Guid OtherKey = Guid.Parse("22222222-2222-2222-2222-222222222220");
    private readonly WebAnalyticsOptionsValidator _sut = new();

    [Fact]
    public void Disabled_configuration_is_valid_without_connections()
    {
        Assert.True(_sut.Validate(null, new WebAnalyticsOptions { Enabled = false }).Succeeded);
    }

    [Fact]
    public void Web_analytics_is_enabled_by_default()
    {
        Assert.True(new WebAnalyticsOptions().Enabled);
        Assert.True(new WebAnalyticsSettings().Enabled);
    }

    [Fact]
    public void Enabled_configuration_is_valid_before_ui_setup()
    {
        Assert.True(_sut.Validate(null, new WebAnalyticsOptions { Enabled = true }).Succeeded);
    }

    [Fact]
    public void Shared_token_is_valid_before_ui_setup()
    {
        var options = new WebAnalyticsOptions
        {
            Enabled = true,
            Providers = { Vercel = { AccessToken = "server-secret" } }
        };

        Assert.True(_sut.Validate(null, options).Succeeded);
    }

    [Fact]
    public void Valid_configuration_succeeds()
    {
        var result = _sut.Validate(null, CreateOptions());

        Assert.True(result.Succeeded);
    }

    [Fact]
    public void Connection_without_mappings_is_valid_for_global_reports()
    {
        var options = CreateOptions();
        options.Connections[0].DocumentRootKeys = [];

        Assert.True(_sut.Validate(null, options).Succeeded);
    }

    [Fact]
    public void Duplicate_root_keys_fail()
    {
        var options = CreateOptions();
        options.Connections.Add(CreateConnection(OtherKey, rootKeys: ["11111111-1111-1111-1111-111111111111"]));

        var result = _sut.Validate(null, options);

        Assert.Contains(result.Failures!, failure => failure.Contains("Document root"));
    }

    [Fact]
    public void Document_type_keys_are_validated_from_server_options()
    {
        var options = CreateOptions();
        options.Connections[0].EnabledDocumentTypeKeys = ["not-a-guid"];

        var result = _sut.Validate(null, options);

        Assert.Contains(result.Failures!, failure => failure.Contains("invalid document type key"));
    }

    [Fact]
    public void Registry_does_not_throw_when_invalid_keys_bypass_startup_validation()
    {
        var options = CreateOptions();
        options.Connections[0].DocumentRootKeys = ["not-a-guid"];
        options.Connections[0].EnabledDocumentTypeKeys = ["also-not-a-guid"];
        var registry = CreateRegistry(options);

        var connection = registry.Get(MainKey);

        Assert.NotNull(connection);
        Assert.Empty(connection.DocumentRootKeys);
        Assert.Empty(connection.EnabledDocumentTypeKeys);
    }

    [Fact]
    public void Registry_uses_shared_access_token_when_connection_has_no_override()
    {
        var options = CreateOptions();
        options.Providers.Vercel.AccessToken = "shared-token";

        var connection = CreateRegistry(options).Get(MainKey);

        Assert.NotNull(connection);
        Assert.Equal("shared-token", connection.AccessToken);
        Assert.True(connection.HasAccessToken);
    }

    [Fact]
    public void Registry_prefers_connection_access_token_override()
    {
        var options = CreateOptions();
        options.Providers.Vercel.AccessToken = "shared-token";
        options.ConnectionAccessTokens[MainKey.ToString()] = "connection-token";

        var connection = CreateRegistry(options).Get(MainKey);

        Assert.NotNull(connection);
        Assert.Equal("connection-token", connection.AccessToken);
    }

    [Fact]
    public void Registry_resolves_plausible_provider_token()
    {
        var key = Guid.Parse("99999999-9999-9999-9999-999999999999");
        var options = CreateOptions();
        options.Providers.Plausible.AccessToken = "plausible-token";
        options.Connections =
        [
            new AnalyticsConnectionOptions
            {
                Key = key,
                Provider = AnalyticsProvider.Plausible,
                SiteId = "example.com",
                EventPropertyNames = ["locale", "title"]
            }
        ];

        var connection = CreateRegistry(options).Get(key);

        Assert.NotNull(connection);
        Assert.Equal(AnalyticsProvider.Plausible, connection.Provider);
        Assert.Equal("plausible-token", connection.AccessToken);
        Assert.True(connection.IsConfigured);
        Assert.False(connection.Capabilities.Flags);
        Assert.True(connection.Capabilities.EventProperties);
        Assert.True(connection.Capabilities.EventDetails);
        Assert.True(connection.Capabilities.Events);
        Assert.True(connection.Capabilities.GlobalEventFiltering);
        Assert.Equal(["locale", "title"], connection.EventPropertyNames);
    }

    [Fact]
    public void Connection_string_representation_redacts_access_token()
    {
        var connection = CreateRegistry(CreateOptions()).Get(MainKey);

        var representation = connection!.ToString();

        Assert.DoesNotContain("test-token", representation);
        Assert.Contains("AccessToken = [REDACTED]", representation);
        Assert.Contains(MainKey.ToString(), representation);
    }

    [Fact]
    public void Registry_is_unconfigured_when_shared_and_connection_tokens_are_missing()
    {
        var options = CreateOptions();
        options.Providers.Vercel.AccessToken = string.Empty;

        var connection = CreateRegistry(options).Get(MainKey);

        Assert.NotNull(connection);
        Assert.False(connection.HasAccessToken);
        Assert.False(connection.IsConfigured);
    }

    [Fact]
    public void Registry_reuses_one_snapshot_until_settings_change()
    {
        var options = CreateOptions();
        var optionsAccessor = Options.Create(options);
        var store = new WebAnalyticsSettingsStore(optionsAccessor);
        var registry = new AnalyticsConnectionRegistry(store, optionsAccessor);

        var first = registry.Capture();
        var second = registry.Capture();
        store.Save(new WebAnalyticsSettings
        {
            Enabled = true,
            Connections =
            [
                new AnalyticsConnectionSettings
                {
                    Key = MainKey,
                    DisplayName = "Changed",
                    ProjectId = "project-id"
                }
            ]
        });
        var changed = registry.Capture();

        Assert.Same(first, second);
        Assert.NotSame(first, changed);
        Assert.NotEqual(first.Revision, changed.Revision);
        Assert.Equal("Changed", changed.Get(MainKey)?.DisplayName);
    }

    [Fact]
    public void Registry_prefers_nearest_root_order()
    {
        var options = CreateOptions();
        options.Connections.Add(CreateConnection(OtherKey,
            rootKeys: ["22222222-2222-2222-2222-222222222222"]));
        var registry = CreateRegistry(options);

        var root = registry.FindNearestRoot([
            Guid.Parse("22222222-2222-2222-2222-222222222222"),
            Guid.Parse("11111111-1111-1111-1111-111111111111")]);

        Assert.Equal(OtherKey, root?.Key);
    }

    [Fact]
    public void Registry_supports_explicit_and_all_document_type_modes()
    {
        var options = CreateOptions();
        var explicitKey = Guid.Parse("33333333-3333-3333-3333-333333333333");
        options.Connections[0].EnabledDocumentTypeKeys = [explicitKey.ToString()];
        var registry = CreateRegistry(options);

        Assert.True(registry.Get(MainKey)!.IsDocumentTypeEnabled("anything", explicitKey));
        Assert.False(registry.Get(MainKey)!.IsDocumentTypeEnabled("anything", Guid.NewGuid()));

        options.Connections[0].EnableAllDocumentTypes = true;
        registry = CreateRegistry(options);
        Assert.True(registry.Get(MainKey)!.IsDocumentTypeEnabled("newPage", Guid.NewGuid()));
    }

    private static WebAnalyticsOptions CreateOptions() => new()
    {
        Enabled = true,
        Providers = { Vercel = { AccessToken = "test-token" } },
        Connections = [CreateConnection(MainKey)]
    };

    private static AnalyticsConnectionRegistry CreateRegistry(WebAnalyticsOptions options)
    {
        var accessor = Options.Create(options);
        return new AnalyticsConnectionRegistry(new WebAnalyticsSettingsStore(accessor), accessor);
    }

    private static AnalyticsConnectionOptions CreateConnection(
        Guid key,
        string[]? rootKeys = null) => new()
    {
        Key = key,
        DisplayName = "Main site",
        ProjectId = "project-id",
        DocumentRootKeys = rootKeys ?? ["11111111-1111-1111-1111-111111111111"],
        EnabledDocumentTypes = ["articlePage"]
    };
}
