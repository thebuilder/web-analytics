using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Configuration;

public static class WebAnalyticsSettingsValidator
{
    public static IReadOnlyList<string> Validate(WebAnalyticsSettings settings) =>
        Validate(settings, WebAnalyticsValidationMode.PersistedSettings);

    internal static IReadOnlyList<string> Validate(
        WebAnalyticsSettings settings,
        WebAnalyticsValidationMode mode)
    {
        var validateEnabledState = mode == WebAnalyticsValidationMode.PersistedSettings;
        var failures = new List<string>();
        if (settings.DefaultRangeDays is < 1 or > 730)
            failures.Add("Default range must be between 1 and 730 days.");
        if (settings.CacheDuration < TimeSpan.Zero || settings.CacheDuration > TimeSpan.FromHours(1))
            failures.Add("Cache duration must be between zero and one hour.");
        var keys = new HashSet<Guid>();
        var roots = new Dictionary<Guid, Guid>();
        foreach (var connection in settings.Connections)
        {
            ValidateConnection(
                connection,
                failures,
                keys,
                roots,
                validateEnabledState);
        }

        return failures;
    }

    private static void ValidateConnection(
        AnalyticsConnectionSettings connection,
        ICollection<string> failures,
        ISet<Guid> keys,
        IDictionary<Guid, Guid> roots,
        bool requireConnectionMetadata)
    {
        var hasSupportedMockScenario = connection.MockScenario is { } mockScenario && Enum.IsDefined(mockScenario);
        if (connection.MockScenario is not null && !hasSupportedMockScenario)
        {
            failures.Add($"Connection '{connection.Key}' defines an unsupported mock analytics scenario.");
        }

        var label = connection.MockScenario?.ToString() ?? FirstNonEmpty(connection.SiteId, connection.ProjectId, connection.Key.ToString());
        if (connection.Key == Guid.Empty)
            failures.Add("Every connection requires a valid key.");
        else if (!keys.Add(connection.Key))
            failures.Add($"Connection key '{connection.Key}' is used more than once.");
        var hasProvider = AnalyticsProviderCatalog.Default.TryGet(connection.Provider, out var provider);
        if (!hasProvider)
            failures.Add($"Connection '{label}' defines an unsupported analytics provider.");
        if (requireConnectionMetadata && !hasSupportedMockScenario && hasProvider &&
            string.IsNullOrWhiteSpace(provider.GetIdentifier(connection)))
            failures.Add(provider.Identifier == AnalyticsConnectionIdentifier.ProjectId
                ? $"Connection '{label}' requires a project ID."
                : $"Connection '{label}' requires a Plausible site ID.");
        if (!string.IsNullOrWhiteSpace(connection.ProjectId) &&
            (!hasProvider || provider.Identifier != AnalyticsConnectionIdentifier.ProjectId))
            failures.Add($"Connection '{label}' cannot define a Vercel project ID for {connection.Provider}.");
        if (!string.IsNullOrWhiteSpace(connection.Team) && (!hasProvider || !provider.SupportsTeam))
            failures.Add($"Connection '{label}' cannot define a Vercel team for {connection.Provider}.");
        if (!string.IsNullOrWhiteSpace(connection.SiteId) &&
            (!hasProvider || provider.Identifier != AnalyticsConnectionIdentifier.SiteId))
            failures.Add($"Connection '{label}' cannot define a Plausible site ID for {connection.Provider}.");
        if (hasSupportedMockScenario && !string.IsNullOrWhiteSpace(connection.ProjectId))
            failures.Add($"Mock connection '{label}' cannot define a Vercel project ID.");
        if (hasSupportedMockScenario && !string.IsNullOrWhiteSpace(connection.Team))
            failures.Add($"Mock connection '{label}' cannot define a Vercel team.");
        if (hasSupportedMockScenario && !string.IsNullOrWhiteSpace(connection.SiteId))
            failures.Add($"Mock connection '{label}' cannot define a Plausible site ID.");
        foreach (var value in connection.DocumentRootKeys)
        {
            if (!Guid.TryParse(value, out var key))
                failures.Add($"Connection '{label}' contains invalid document root key '{value}'.");
            else if (roots.TryGetValue(key, out var owner))
                failures.Add($"Document root '{key}' is assigned to both '{owner}' and '{connection.Key}'.");
            else
                roots[key] = connection.Key;
        }

        foreach (var value in connection.EnabledDocumentTypeKeys)
        {
            if (!Guid.TryParse(value, out _))
                failures.Add($"Connection '{label}' contains invalid document type key '{value}'.");
        }
    }

    private static string FirstNonEmpty(params string[] values) =>
        values.First(value => !string.IsNullOrWhiteSpace(value));
}

internal enum WebAnalyticsValidationMode
{
    PersistedSettings,
    ServerOptions
}
