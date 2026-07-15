namespace Umbraco.VercelAnalytics.Configuration;

public sealed class VercelAnalyticsOptions
{
    public const string SectionName = "VercelAnalytics";

    public bool Enabled { get; set; }

    public string? DefaultConnection { get; set; }

    public int DefaultRangeDays { get; set; } = 30;

    public TimeSpan CacheDuration { get; set; } = TimeSpan.FromMinutes(5);

    public Dictionary<string, VercelAnalyticsConnectionOptions> Connections { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
}

public sealed class VercelAnalyticsConnectionOptions
{
    public string DisplayName { get; set; } = string.Empty;

    public string AccessToken { get; set; } = string.Empty;

    public string ProjectId { get; set; } = string.Empty;

    public string? TeamId { get; set; }

    public string? TeamSlug { get; set; }

    public string[] Hostnames { get; set; } = [];

    public string[] DocumentRootKeys { get; set; } = [];

    public string[] EnabledDocumentTypes { get; set; } = [];
}
