using System.Net;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Providers;

internal static class PlausibleProvider
{
    internal static AnalyticsProviderDefinition Definition { get; } = new(
        AnalyticsProvider.Plausible,
        new(
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
            Events: true,
            EventDetails: true,
            EventProperties: true,
            GlobalEventFiltering: true,
            Flags: false,
            BreakdownOrdering: true),
        AnalyticsConnectionIdentifier.SiteId,
        supportsTeam: false,
        new(
            "Sites using Plausible Analytics",
            "plausible",
            new("siteId", "Plausible site ID", "Use the domain configured in your Plausible site settings.", "a Plausible site ID"),
            "Vercel project ID",
            "Plausible site ID",
            "Vercel team",
            new("Stats API key", "Configure a Plausible Stats API key in the server settings.", "https://plausible.io/docs/stats-api"),
            new("event properties", "Optional custom event property names configured for this Plausible site.", 20, 100)),
        options => options.Providers.Plausible.AccessToken,
        invalidQueryStatuses: new HashSet<HttpStatusCode> { HttpStatusCode.BadRequest, HttpStatusCode.NotFound });
}
