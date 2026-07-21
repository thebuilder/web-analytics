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
        new(
            "Projects using Vercel Web Analytics",
            "vercel",
            new("projectId", "Vercel project ID", "Use the project ID from your Vercel project settings.", "a Vercel project ID"),
            "Vercel project ID",
            "Plausible site ID",
            "Vercel team",
            new("access token", "Configure a Vercel access token in the server settings.", "https://vercel.com/docs/rest-api"),
            null),
        options => options.Providers.Vercel.AccessToken);
}
