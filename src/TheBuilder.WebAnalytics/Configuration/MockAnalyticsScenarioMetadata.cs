using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Configuration;

internal static class MockAnalyticsScenarioMetadata
{
    public static string DisplayName(MockAnalyticsScenario scenario) => scenario switch
    {
        MockAnalyticsScenario.Complete => "Demo",
        MockAnalyticsScenario.Utm => "Mock · UTM campaigns",
        MockAnalyticsScenario.Flags => "Mock · Feature flags",
        MockAnalyticsScenario.Events => "Mock · Custom events",
        _ => throw new ArgumentOutOfRangeException(nameof(scenario), scenario, null)
    };
}
