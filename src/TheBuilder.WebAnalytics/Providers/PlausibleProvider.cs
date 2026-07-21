using System.Net;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Providers;

internal static class PlausibleProvider
{
    internal static AnalyticsProviderDefinition Definition { get; } = new(
        AnalyticsProvider.Plausible,
        AnalyticsProviderCapabilities.FromClient<PlausibleAnalyticsClient>(
            [
                AnalyticsDimension.RequestPath,
                AnalyticsDimension.Referrer,
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
            ],
            globalEventFiltering: true,
            breakdownOrdering: true),
        new(
            AnalyticsConnectionIdentifier.SiteId,
            "Plausible site ID",
            "Use the domain configured in your Plausible site settings.",
            "a Plausible site ID"),
        new(
            "Sites using Plausible Analytics",
            "plausible",
            null,
            new("Stats API key", "Configure a Plausible Stats API key in the server settings.", "https://plausible.io/docs/stats-api"),
            new("event properties", "Optional custom event property names configured for this Plausible site.", 20, 100)),
        options => options.Providers.Plausible.AccessToken,
        invalidQueryStatuses: new HashSet<HttpStatusCode> { HttpStatusCode.BadRequest, HttpStatusCode.NotFound },
        fallbackBaseUrl: GetSiteBaseUrl);

    internal static AnalyticsProviderRegistration Registration { get; } =
        AnalyticsProviderRegistration.Create<PlausibleAnalyticsClient>(Definition, new Uri("https://plausible.io/"));

    private static string? GetSiteBaseUrl(AnalyticsConnection connection)
    {
        var siteId = connection.SiteId.Trim();
        return Uri.CheckHostName(siteId) == UriHostNameType.Unknown
            ? null
            : $"https://{siteId}";
    }
}
