using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Providers;

internal static class VercelProvider
{
    internal static AnalyticsProviderDefinition Definition { get; } = new(
        AnalyticsProvider.Vercel,
        AnalyticsProviderCapabilities.FromClient<VercelAnalyticsClient>(
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
            globalEventFiltering: false,
            globalEventPropertyFiltering: false,
            breakdownOrdering: false),
        new(
            AnalyticsConnectionIdentifier.ProjectId,
            "Use the project ID from your Vercel project settings.",
            "a Vercel project ID"),
        new(
            "Projects using Vercel Web Analytics",
            "vercel",
            new("team", "Team ID or slug", "Optional team slug or ID for projects owned by a Vercel team."),
            new("access token", "Configure a Vercel access token in the server settings.", "https://vercel.com/docs/rest-api"),
            null),
        options => options.Providers.Vercel.AccessToken);

    internal static AnalyticsProviderRegistration Registration { get; } =
        AnalyticsProviderRegistration.Create<VercelAnalyticsClient>(Definition, new Uri("https://api.vercel.com/"));
}
