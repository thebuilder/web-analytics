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
            globalEventPropertyFiltering: true,
            breakdownOrdering: true),
        new(
            AnalyticsConnectionIdentifier.SiteId,
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
        AnalyticsProviderRegistration.Create<PlausibleAnalyticsClient>(Definition, GetApiBaseUrl);

    internal static Uri GetApiBaseUrl(WebAnalyticsOptions options)
    {
        if (TryGetApiBaseUrl(options.Providers.Plausible.BaseUrl, out var baseUrl)) return baseUrl;

        throw new ArgumentException(
            "Plausible BaseUrl must be an absolute HTTP or HTTPS URL without a query, fragment, or user information.",
            nameof(options));
    }

    internal static bool TryGetApiBaseUrl(string? configuredUrl, out Uri baseUrl)
    {
        baseUrl = null!;
        if (!Uri.TryCreate(configuredUrl, UriKind.Absolute, out var parsed) ||
            (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps) ||
            string.IsNullOrWhiteSpace(parsed.Host) ||
            !string.IsNullOrEmpty(parsed.UserInfo) ||
            !string.IsNullOrEmpty(parsed.Query) ||
            !string.IsNullOrEmpty(parsed.Fragment))
        {
            return false;
        }

        baseUrl = new Uri($"{parsed.GetLeftPart(UriPartial.Path).TrimEnd('/')}/", UriKind.Absolute);
        return true;
    }

    private static string? GetSiteBaseUrl(AnalyticsConnection connection)
    {
        var siteId = connection.SiteId.Trim();
        return Uri.CheckHostName(siteId) == UriHostNameType.Unknown
            ? null
            : $"https://{siteId}";
    }
}
