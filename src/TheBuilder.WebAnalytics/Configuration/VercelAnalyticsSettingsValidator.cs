namespace TheBuilder.WebAnalytics.Configuration;

public static class VercelAnalyticsSettingsValidator
{
    public static IReadOnlyList<string> Validate(VercelAnalyticsSettings settings) =>
        Validate(settings, VercelAnalyticsValidationMode.PersistedSettings);

    internal static IReadOnlyList<string> Validate(
        VercelAnalyticsSettings settings,
        VercelAnalyticsValidationMode mode)
    {
        var validateEnabledState = mode == VercelAnalyticsValidationMode.PersistedSettings;
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
        VercelAnalyticsConnectionSettings connection,
        ICollection<string> failures,
        ISet<Guid> keys,
        IDictionary<Guid, Guid> roots,
        bool requireConnectionMetadata)
    {
        if (connection.MockScenario is { } mockScenario && !Enum.IsDefined(mockScenario))
        {
            failures.Add($"Connection '{connection.Key}' defines an unsupported mock analytics scenario.");
            return;
        }

        var label = connection.MockScenario?.ToString() ??
            (string.IsNullOrWhiteSpace(connection.ProjectId) ? connection.Key.ToString() : connection.ProjectId);
        if (connection.Key == Guid.Empty)
            failures.Add("Every connection requires a valid key.");
        else if (!keys.Add(connection.Key))
            failures.Add($"Connection key '{connection.Key}' is used more than once.");
        if (requireConnectionMetadata && !connection.IsMock && string.IsNullOrWhiteSpace(connection.ProjectId))
            failures.Add($"Connection '{label}' requires a project ID.");
        if (connection.IsMock && !string.IsNullOrWhiteSpace(connection.ProjectId))
            failures.Add($"Mock connection '{label}' cannot define a Vercel project ID.");
        if (connection.IsMock && !string.IsNullOrWhiteSpace(connection.Team))
            failures.Add($"Mock connection '{label}' cannot define a Vercel team.");
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
}

internal enum VercelAnalyticsValidationMode
{
    PersistedSettings,
    ServerOptions
}
