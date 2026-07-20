using System.Net;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Configuration;

public sealed class AnalyticsProviderCatalog
{
    private static readonly AnalyticsDimension[] VercelDimensions = Enum.GetValues<AnalyticsDimension>();
    private static readonly AnalyticsDimension[] PlausibleDimensions =
    [
        AnalyticsDimension.RequestPath,
        AnalyticsDimension.ReferrerHostname,
        AnalyticsDimension.Country,
        AnalyticsDimension.DeviceType,
        AnalyticsDimension.BrowserName,
        AnalyticsDimension.OsName,
        AnalyticsDimension.UtmSource,
        AnalyticsDimension.UtmMedium,
        AnalyticsDimension.UtmCampaign,
        AnalyticsDimension.UtmTerm,
        AnalyticsDimension.UtmContent,
        AnalyticsDimension.EventName
    ];

    public static AnalyticsProviderCatalog Default { get; } = new();

    private readonly IReadOnlyDictionary<AnalyticsProvider, AnalyticsProviderDefinition> _definitions;

    public AnalyticsProviderCatalog()
    {
        Definitions =
        [
            new(
                AnalyticsProvider.Vercel,
                new(VercelDimensions, Events: true, EventProperties: true, Flags: true),
                AnalyticsConnectionIdentifier.ProjectId,
                supportsTeam: true,
                options => options.Providers.Vercel.AccessToken),
            new(
                AnalyticsProvider.Plausible,
                new(PlausibleDimensions, Events: true, EventProperties: false, Flags: false),
                AnalyticsConnectionIdentifier.SiteId,
                supportsTeam: false,
                options => options.Providers.Plausible.AccessToken,
                invalidQueryStatuses: new HashSet<HttpStatusCode> { HttpStatusCode.BadRequest, HttpStatusCode.NotFound })
        ];
        _definitions = Definitions.ToDictionary(definition => definition.Provider);
    }

    public IReadOnlyList<AnalyticsProviderDefinition> Definitions { get; }

    public AnalyticsProviderDefinition Get(AnalyticsProvider provider) =>
        _definitions.TryGetValue(provider, out var definition)
            ? definition
            : throw new ArgumentOutOfRangeException(nameof(provider), provider, "Unsupported analytics provider.");

    public bool TryGet(AnalyticsProvider provider, out AnalyticsProviderDefinition definition) =>
        _definitions.TryGetValue(provider, out definition!);
}

public sealed class AnalyticsProviderDefinition(
    AnalyticsProvider provider,
    AnalyticsCapabilities capabilities,
    AnalyticsConnectionIdentifier identifier,
    bool supportsTeam,
    Func<WebAnalyticsOptions, string> accessToken,
    IReadOnlySet<HttpStatusCode>? invalidQueryStatuses = null)
{
    private readonly IReadOnlySet<HttpStatusCode> _invalidQueryStatuses =
        invalidQueryStatuses ?? new HashSet<HttpStatusCode> { HttpStatusCode.BadRequest };

    public AnalyticsProvider Provider { get; } = provider;

    public AnalyticsCapabilities Capabilities { get; } = capabilities;

    public AnalyticsConnectionIdentifier Identifier { get; } = identifier;

    public bool SupportsTeam { get; } = supportsTeam;

    public string GetAccessToken(WebAnalyticsOptions options) => accessToken(options);

    public string GetIdentifier(AnalyticsConnectionSettings connection) => Identifier switch
    {
        AnalyticsConnectionIdentifier.ProjectId => connection.ProjectId,
        AnalyticsConnectionIdentifier.SiteId => connection.SiteId,
        _ => string.Empty
    };

    public string GetIdentifier(AnalyticsConnection connection) => Identifier switch
    {
        AnalyticsConnectionIdentifier.ProjectId => connection.ProjectId,
        AnalyticsConnectionIdentifier.SiteId => connection.SiteId,
        _ => string.Empty
    };

    public bool IsInvalidQuery(HttpStatusCode statusCode) => _invalidQueryStatuses.Contains(statusCode);

    public string ConnectionTestFailure(HttpStatusCode statusCode) => statusCode switch
    {
        HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden =>
            $"{Provider} rejected the configured credentials or connection access.",
        HttpStatusCode.PaymentRequired =>
            $"The analytics API is unavailable for the current {Provider} plan or reporting window.",
        HttpStatusCode.TooManyRequests =>
            $"{Provider} rate-limited the connection test. Try again shortly.",
        _ when IsInvalidQuery(statusCode) =>
            $"{Provider} rejected the connection identifier or analytics query.",
        _ => $"{Provider} Analytics is temporarily unavailable."
    };
}

public enum AnalyticsConnectionIdentifier
{
    ProjectId,
    SiteId
}
