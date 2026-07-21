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
        options => options.Providers.Plausible.AccessToken,
        invalidQueryStatuses: new HashSet<HttpStatusCode> { HttpStatusCode.BadRequest, HttpStatusCode.NotFound });
}
