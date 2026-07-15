using Microsoft.Extensions.Options;

namespace Umbraco.VercelAnalytics.Configuration;

public sealed class VercelAnalyticsOptionsValidator : IValidateOptions<VercelAnalyticsOptions>
{
    public ValidateOptionsResult Validate(string? name, VercelAnalyticsOptions options)
    {
        if (!options.Enabled)
        {
            return ValidateOptionsResult.Success;
        }

        var failures = new List<string>();
        if (options.Connections.Count == 0)
        {
            failures.Add("At least one Vercel Analytics connection is required when the package is enabled.");
        }

        if (options.DefaultRangeDays is < 1 or > 730)
        {
            failures.Add("DefaultRangeDays must be between 1 and 730.");
        }

        if (options.CacheDuration < TimeSpan.Zero || options.CacheDuration > TimeSpan.FromHours(1))
        {
            failures.Add("CacheDuration must be between zero and one hour.");
        }

        var hostnames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var rootKeys = new Dictionary<Guid, string>();

        foreach (var (alias, connection) in options.Connections)
        {
            ValidateConnection(alias, connection, failures, hostnames, rootKeys);
        }

        if (string.IsNullOrWhiteSpace(options.DefaultConnection) ||
            !options.Connections.ContainsKey(options.DefaultConnection))
        {
            failures.Add("DefaultConnection must identify a configured connection.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateConnection(
        string alias,
        VercelAnalyticsConnectionOptions connection,
        ICollection<string> failures,
        IDictionary<string, string> hostnames,
        IDictionary<Guid, string> rootKeys)
    {
        if (string.IsNullOrWhiteSpace(alias)) failures.Add("Connection aliases cannot be empty.");
        if (string.IsNullOrWhiteSpace(connection.DisplayName)) failures.Add($"Connection '{alias}' requires DisplayName.");
        if (string.IsNullOrWhiteSpace(connection.AccessToken)) failures.Add($"Connection '{alias}' requires AccessToken.");
        if (string.IsNullOrWhiteSpace(connection.ProjectId)) failures.Add($"Connection '{alias}' requires ProjectId.");
        if (!string.IsNullOrWhiteSpace(connection.TeamId) && !string.IsNullOrWhiteSpace(connection.TeamSlug))
        {
            failures.Add($"Connection '{alias}' cannot configure both TeamId and TeamSlug.");
        }

        if (connection.Hostnames.Length == 0 && connection.DocumentRootKeys.Length == 0)
        {
            failures.Add($"Connection '{alias}' requires at least one hostname or document root key.");
        }

        foreach (var hostname in connection.Hostnames)
        {
            var normalized = VercelAnalyticsConnectionRegistry.NormalizeHostname(hostname);
            if (string.IsNullOrWhiteSpace(normalized))
            {
                failures.Add($"Connection '{alias}' contains an invalid hostname.");
            }
            else if (hostnames.TryGetValue(normalized, out var owner))
            {
                failures.Add($"Hostname '{normalized}' is assigned to both '{owner}' and '{alias}'.");
            }
            else
            {
                hostnames[normalized] = alias;
            }
        }

        foreach (var rawKey in connection.DocumentRootKeys)
        {
            if (!Guid.TryParse(rawKey, out var rootKey))
            {
                failures.Add($"Connection '{alias}' contains invalid document root key '{rawKey}'.");
            }
            else if (rootKeys.TryGetValue(rootKey, out var owner))
            {
                failures.Add($"Document root '{rootKey}' is assigned to both '{owner}' and '{alias}'.");
            }
            else
            {
                rootKeys[rootKey] = alias;
            }
        }
    }
}
