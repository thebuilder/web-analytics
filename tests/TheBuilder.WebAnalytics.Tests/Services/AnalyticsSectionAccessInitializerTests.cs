using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class AnalyticsSectionAccessInitializerTests
{
    [Fact]
    public void ShouldGrantAnalyticsSection_returns_true_when_missing()
    {
        Assert.True(AnalyticsSectionAccessInitializer.ShouldGrantAnalyticsSection(["Umb.Section.Content"]));
    }

    [Fact]
    public void ShouldGrantAnalyticsSection_recognizes_existing_assignment_case_insensitively()
    {
        Assert.False(AnalyticsSectionAccessInitializer.ShouldGrantAnalyticsSection([
            "Umb.Section.Content",
            Constants.SectionAlias.ToUpperInvariant()
        ]));
    }
}
