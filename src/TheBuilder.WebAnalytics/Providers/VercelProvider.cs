using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Providers;

internal static class VercelProvider
{
    internal static AnalyticsProviderDefinition Definition { get; } = new(
        AnalyticsProvider.Vercel,
        new(
            [
                AnalyticsDimension.RequestPath,
                AnalyticsDimension.Route,
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
            ],
            Events: true,
            EventDetails: true,
            EventProperties: true,
            GlobalEventFiltering: false,
            Flags: true,
            BreakdownOrdering: false),
        AnalyticsConnectionIdentifier.ProjectId,
        supportsTeam: true,
        options => options.Providers.Vercel.AccessToken);
}
