using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Configuration;

public sealed class WebAnalyticsOptions
{
    public const string SectionName = "WebAnalytics";

    public bool Enabled { get; set; } = true;

    public bool EnableMockConnections { get; set; }

    public int DefaultRangeDays { get; set; } = 30;

    public TimeSpan CacheDuration { get; set; } = TimeSpan.FromMinutes(5);

    public List<AnalyticsConnectionOptions> Connections { get; set; } = [];

    public Dictionary<string, string> ConnectionAccessTokens { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);

    public WebAnalyticsProvidersOptions Providers { get; set; } = new();
}

public sealed class WebAnalyticsProvidersOptions
{
    public VercelAnalyticsProviderOptions Vercel { get; set; } = new();

    public PlausibleAnalyticsProviderOptions Plausible { get; set; } = new();
}

public sealed class VercelAnalyticsProviderOptions
{
    public string AccessToken { get; set; } = string.Empty;
}

public sealed class PlausibleAnalyticsProviderOptions
{
    public string AccessToken { get; set; } = string.Empty;
}

public sealed class AnalyticsConnectionOptions
{
    public Guid Key { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public AnalyticsProvider Provider { get; set; } = AnalyticsProvider.Vercel;

    public string ProjectId { get; set; } = string.Empty;

    public string? Team { get; set; }

    public string SiteId { get; set; } = string.Empty;

    public string[] EventPropertyNames { get; set; } = [];

    public MockAnalyticsScenario? MockScenario { get; set; }

    public string[] DocumentRootKeys { get; set; } = [];

    public string[] EnabledDocumentTypes { get; set; } = [];

    public bool EnableAllDocumentTypes { get; set; }

    public string[] EnabledDocumentTypeKeys { get; set; } = [];
}
