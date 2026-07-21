using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public sealed class AnalyticsProviderClientResolver(
    IEnumerable<IAnalyticsProviderClient> providerClients,
    MockAnalyticsClient mockClient) : IAnalyticsProviderClientResolver
{
    private readonly IReadOnlyDictionary<AnalyticsProvider, IAnalyticsProviderClient> _providerClients =
        BuildProviderClients(providerClients);

    public IAnalyticsProviderClient Get(AnalyticsConnection connection) =>
        connection.IsMock
            ? mockClient
            : _providerClients.TryGetValue(connection.Provider, out var client)
                ? client
                : throw new ArgumentOutOfRangeException(nameof(connection), connection.Provider, "Unsupported analytics provider.");

    private static IReadOnlyDictionary<AnalyticsProvider, IAnalyticsProviderClient> BuildProviderClients(
        IEnumerable<IAnalyticsProviderClient> clients)
    {
        var clientList = clients.ToArray();
        var duplicates = clientList.GroupBy(client => client.Definition.Provider).FirstOrDefault(group => group.Count() > 1);
        if (duplicates is not null)
            throw new InvalidOperationException($"Multiple analytics clients are registered for {duplicates.Key}.");

        var byProvider = clientList.ToDictionary(client => client.Definition.Provider);
        foreach (var definition in AnalyticsProviderCatalog.Default.Definitions)
        {
            if (!byProvider.ContainsKey(definition.Provider))
                throw new InvalidOperationException($"No analytics client is registered for {definition.Provider}.");
        }
        foreach (var client in clientList)
        {
            ValidateCapabilities(client);
        }
        return byProvider;
    }

    private static void ValidateCapabilities(IAnalyticsProviderClient client)
    {
        var capabilities = client.Definition.Capabilities;
        ValidateCapability(client, nameof(capabilities.Events), capabilities.Events, client is IAnalyticsEventsProviderClient);
        ValidateCapability(client, nameof(capabilities.EventDetails), capabilities.EventDetails, client is IAnalyticsEventDetailsProviderClient);
        ValidateCapability(client, nameof(capabilities.EventProperties), capabilities.EventProperties, client is IAnalyticsEventPropertiesProviderClient);
        ValidateCapability(client, nameof(capabilities.Flags), capabilities.Flags, client is IAnalyticsFlagsProviderClient);

        if (capabilities.EventProperties && !capabilities.EventDetails)
            throw new InvalidOperationException($"The {client.Definition.Provider} analytics client advertises EventProperties without EventDetails.");
        if (capabilities.EventDetails && !capabilities.Events)
            throw new InvalidOperationException($"The {client.Definition.Provider} analytics client advertises EventDetails without Events.");
        if (capabilities.GlobalEventFiltering && !capabilities.Events)
            throw new InvalidOperationException($"The {client.Definition.Provider} analytics client advertises GlobalEventFiltering without Events.");
    }

    private static void ValidateCapability(
        IAnalyticsProviderClient client,
        string capability,
        bool advertised,
        bool implemented)
    {
        if (advertised == implemented) return;
        throw new InvalidOperationException(
            $"The {client.Definition.Provider} analytics client's {capability} capability does not match its implemented provider interface.");
    }
}
