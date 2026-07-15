using Microsoft.Extensions.Options;
using Umbraco.VercelAnalytics.Configuration;

namespace Umbraco.VercelAnalytics.Tests.Configuration;

public sealed class VercelAnalyticsOptionsValidatorTests
{
    private readonly VercelAnalyticsOptionsValidator _sut = new();

    [Fact]
    public void Disabled_configuration_is_valid_without_connections()
    {
        Assert.True(_sut.Validate(null, new VercelAnalyticsOptions()).Succeeded);
    }

    [Fact]
    public void Valid_configuration_succeeds()
    {
        var result = _sut.Validate(null, CreateOptions());

        Assert.True(result.Succeeded);
    }

    [Fact]
    public void Duplicate_normalized_hostnames_fail()
    {
        var options = CreateOptions();
        options.Connections["other"] = CreateConnection(hostnames: ["EXAMPLE.COM."]);

        var result = _sut.Validate(null, options);

        Assert.Contains(result.Failures!, failure => failure.Contains("assigned to both"));
    }

    [Fact]
    public void Duplicate_root_keys_fail()
    {
        var options = CreateOptions();
        options.Connections["other"] = CreateConnection(rootKeys: ["11111111-1111-1111-1111-111111111111"]);

        var result = _sut.Validate(null, options);

        Assert.Contains(result.Failures!, failure => failure.Contains("Document root"));
    }

    [Fact]
    public void Team_id_and_slug_are_mutually_exclusive()
    {
        var options = CreateOptions();
        options.Connections["main"].TeamId = "team_id";
        options.Connections["main"].TeamSlug = "team-slug";

        var result = _sut.Validate(null, options);

        Assert.Contains(result.Failures!, failure => failure.Contains("both TeamId and TeamSlug"));
    }

    [Fact]
    public void Registry_prefers_nearest_root_order_and_normalizes_hostname()
    {
        var options = CreateOptions();
        options.Connections["root"] = CreateConnection(
            hostnames: ["root.example.com"],
            rootKeys: ["22222222-2222-2222-2222-222222222222"]);
        var registry = new VercelAnalyticsConnectionRegistry(Options.Create(options));

        var root = registry.FindNearestRoot([
            Guid.Parse("22222222-2222-2222-2222-222222222222"),
            Guid.Parse("11111111-1111-1111-1111-111111111111")]);
        var hostname = registry.FindByHostname("EXAMPLE.COM.");

        Assert.Equal("root", root?.Alias);
        Assert.Equal("main", hostname?.Alias);
    }

    private static VercelAnalyticsOptions CreateOptions() => new()
    {
        Enabled = true,
        DefaultConnection = "main",
        Connections = new Dictionary<string, VercelAnalyticsConnectionOptions>(StringComparer.OrdinalIgnoreCase)
        {
            ["main"] = CreateConnection()
        }
    };

    private static VercelAnalyticsConnectionOptions CreateConnection(
        string[]? hostnames = null,
        string[]? rootKeys = null) => new()
    {
        DisplayName = "Main site",
        AccessToken = "test-token",
        ProjectId = "project-id",
        Hostnames = hostnames ?? ["example.com"],
        DocumentRootKeys = rootKeys ?? ["11111111-1111-1111-1111-111111111111"],
        EnabledDocumentTypes = ["articlePage"]
    };
}
