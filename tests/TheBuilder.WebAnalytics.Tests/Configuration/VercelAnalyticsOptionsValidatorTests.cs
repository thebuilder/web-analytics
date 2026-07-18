using Microsoft.Extensions.Options;
using TheBuilder.WebAnalytics.Configuration;

namespace TheBuilder.WebAnalytics.Tests.Configuration;

public sealed class VercelAnalyticsOptionsValidatorTests
{
    private static readonly Guid MainKey = Guid.Parse("11111111-1111-1111-1111-111111111110");
    private static readonly Guid OtherKey = Guid.Parse("22222222-2222-2222-2222-222222222220");
    private readonly VercelAnalyticsOptionsValidator _sut = new();

    [Fact]
    public void Disabled_configuration_is_valid_without_connections()
    {
        Assert.True(_sut.Validate(null, new VercelAnalyticsOptions()).Succeeded);
    }

    [Fact]
    public void Enabled_configuration_is_valid_before_ui_setup()
    {
        Assert.True(_sut.Validate(null, new VercelAnalyticsOptions { Enabled = true }).Succeeded);
    }

    [Fact]
    public void Shared_token_is_valid_before_ui_setup()
    {
        var options = new VercelAnalyticsOptions
        {
            Enabled = true,
            AccessToken = "server-secret"
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
        var registry = new VercelAnalyticsConnectionRegistry(Options.Create(options));

        var connection = registry.Get(MainKey);

        Assert.NotNull(connection);
        Assert.Empty(connection.DocumentRootKeys);
        Assert.Empty(connection.EnabledDocumentTypeKeys);
    }

    [Fact]
    public void Registry_uses_shared_access_token_when_connection_has_no_override()
    {
        var options = CreateOptions();
        options.AccessToken = "shared-token";

        var connection = new VercelAnalyticsConnectionRegistry(Options.Create(options)).Get(MainKey);

        Assert.NotNull(connection);
        Assert.Equal("shared-token", connection.AccessToken);
        Assert.True(connection.HasAccessToken);
    }

    [Fact]
    public void Registry_prefers_connection_access_token_override()
    {
        var options = CreateOptions();
        options.AccessToken = "shared-token";
        options.ConnectionAccessTokens[MainKey.ToString()] = "connection-token";

        var connection = new VercelAnalyticsConnectionRegistry(Options.Create(options)).Get(MainKey);

        Assert.NotNull(connection);
        Assert.Equal("connection-token", connection.AccessToken);
    }

    [Fact]
    public void Registry_is_unconfigured_when_shared_and_connection_tokens_are_missing()
    {
        var options = CreateOptions();
        options.AccessToken = string.Empty;

        var connection = new VercelAnalyticsConnectionRegistry(Options.Create(options)).Get(MainKey);

        Assert.NotNull(connection);
        Assert.False(connection.HasAccessToken);
        Assert.False(connection.IsConfigured);
    }

    [Fact]
    public void Registry_reuses_one_snapshot_until_settings_change()
    {
        var options = CreateOptions();
        var optionsAccessor = Options.Create(options);
        var store = new VercelAnalyticsSettingsStore(optionsAccessor);
        var registry = new VercelAnalyticsConnectionRegistry(store, optionsAccessor);

        var first = registry.Capture();
        var second = registry.Capture();
        store.Save(new VercelAnalyticsSettings
        {
            Enabled = true,
            Connections =
            [
                new VercelAnalyticsConnectionSettings
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
        var registry = new VercelAnalyticsConnectionRegistry(Options.Create(options));

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
        var registry = new VercelAnalyticsConnectionRegistry(Options.Create(options));

        Assert.True(registry.Get(MainKey)!.IsDocumentTypeEnabled("anything", explicitKey));
        Assert.False(registry.Get(MainKey)!.IsDocumentTypeEnabled("anything", Guid.NewGuid()));

        options.Connections[0].EnableAllDocumentTypes = true;
        registry = new VercelAnalyticsConnectionRegistry(Options.Create(options));
        Assert.True(registry.Get(MainKey)!.IsDocumentTypeEnabled("newPage", Guid.NewGuid()));
    }

    private static VercelAnalyticsOptions CreateOptions() => new()
    {
        Enabled = true,
        AccessToken = "test-token",
        Connections = [CreateConnection(MainKey)]
    };

    private static VercelAnalyticsConnectionOptions CreateConnection(
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
