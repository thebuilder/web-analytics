using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public sealed class AnalyticsProviderClientResolver(
    VercelAnalyticsClient vercelClient,
    MockAnalyticsClient mockClient,
    PlausibleAnalyticsClient plausibleClient) : IAnalyticsProviderClientResolver
{
    public IAnalyticsProviderClient Get(AnalyticsConnection connection) =>
        connection.IsMock
            ? mockClient
            : connection.Provider switch
            {
                AnalyticsProvider.Vercel => vercelClient,
                AnalyticsProvider.Plausible => plausibleClient,
                _ => throw new ArgumentOutOfRangeException(nameof(connection), connection.Provider, "Unsupported analytics provider.")
            };
}
