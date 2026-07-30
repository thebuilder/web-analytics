using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Configuration;

internal static class AnalyticsProviderServiceCollectionExtensions
{
    internal static IServiceCollection AddAnalyticsProvider<TClient>(
        this IServiceCollection services,
        Uri baseAddress)
        where TClient : class, IAnalyticsProviderClient
    {
        services.AddHttpClient<TClient>(client =>
        {
            client.BaseAddress = baseAddress;
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        services.AddTransient<IAnalyticsProviderClient>(serviceProvider =>
            serviceProvider.GetRequiredService<TClient>());
        return services;
    }

    internal static IServiceCollection AddAnalyticsProvider<TClient>(
        this IServiceCollection services,
        Func<WebAnalyticsOptions, Uri> baseAddress)
        where TClient : class, IAnalyticsProviderClient
    {
        services.AddHttpClient<TClient>((serviceProvider, client) =>
        {
            client.BaseAddress = baseAddress(serviceProvider.GetRequiredService<IOptions<WebAnalyticsOptions>>().Value);
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        services.AddTransient<IAnalyticsProviderClient>(serviceProvider =>
            serviceProvider.GetRequiredService<TClient>());
        return services;
    }
}
