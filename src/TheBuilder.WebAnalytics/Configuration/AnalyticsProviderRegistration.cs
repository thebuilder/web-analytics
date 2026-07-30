using Microsoft.Extensions.DependencyInjection;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Configuration;

internal sealed class AnalyticsProviderRegistration(
    AnalyticsProviderDefinition definition,
    Action<IServiceCollection> registerClient)
{
    internal AnalyticsProviderDefinition Definition { get; } = definition;

    internal void RegisterClient(IServiceCollection services) => registerClient(services);

    internal static AnalyticsProviderRegistration Create<TClient>(
        AnalyticsProviderDefinition definition,
        Uri baseAddress)
        where TClient : class, IAnalyticsProviderClient =>
        new(definition, services => services.AddAnalyticsProvider<TClient>(baseAddress));

    internal static AnalyticsProviderRegistration Create<TClient>(
        AnalyticsProviderDefinition definition,
        Func<WebAnalyticsOptions, Uri> baseAddress)
        where TClient : class, IAnalyticsProviderClient =>
        new(definition, services => services.AddAnalyticsProvider<TClient>(baseAddress));
}
