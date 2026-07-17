using Umbraco.VercelAnalytics.Models;

namespace Umbraco.VercelAnalytics.Configuration;

public sealed class VercelAnalyticsOptions
{
    public const string SectionName = "VercelAnalytics";

    public bool Enabled { get; set; }

    public string AccessToken { get; set; } = string.Empty;

    public int DefaultRangeDays { get; set; } = 30;

    public TimeSpan CacheDuration { get; set; } = TimeSpan.FromMinutes(5);

    public List<VercelAnalyticsConnectionOptions> Connections { get; set; } = [];

    public Dictionary<string, string> ConnectionAccessTokens { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
}

public sealed class VercelAnalyticsConnectionOptions
{
    public Guid Key { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string ProjectId { get; set; } = string.Empty;

    public string? Team { get; set; }

    public MockAnalyticsScenario? MockScenario { get; set; }

    public string[] DocumentRootKeys { get; set; } = [];

    public string[] EnabledDocumentTypes { get; set; } = [];

    public bool EnableAllDocumentTypes { get; set; }

    public string[] EnabledDocumentTypeKeys { get; set; } = [];
}
