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
        if (hasProvider)
            provider.ValidateConnection(connection, label, requireConnectionMetadata, hasSupportedMockScenario, failures);
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
