using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class AnalyticsFilterParserTests
{
    [Fact]
    public void Parses_allowlisted_dimensions_and_values_containing_colons()
    {
        var success = AnalyticsFilterParser.TryParse(
            ["Country:DK", "RequestPath:/news:archive", "EventName:Signup"],
            out var filters,
            out var error);

        Assert.True(success, error);
        Assert.Equal(
            [
                new AnalyticsFilter(AnalyticsDimension.Country, "DK"),
                new AnalyticsFilter(AnalyticsDimension.RequestPath, "/news:archive"),
                new AnalyticsFilter(AnalyticsDimension.EventName, "Signup")
            ],
            filters);
    }

    [Theory]
    [InlineData("Unsupported:value")]
    [InlineData("999:value")]
    [InlineData("Country:")]
    [InlineData("Country:DK", "Country:US")]
    public void Rejects_invalid_or_duplicate_filters(params string[] values)
    {
        Assert.False(AnalyticsFilterParser.TryParse(values, out _, out var error));
        Assert.NotNull(error);
    }

    [Fact]
    public void Rejects_control_characters_and_excessive_filter_counts()
    {
        Assert.False(AnalyticsFilterParser.TryParse(["Country:D\nK"], out _, out _));
        Assert.False(AnalyticsFilterParser.TryParse(
            Enumerable.Range(0, AnalyticsFilterParser.MaximumFilters + 1).Select(index => $"Country:{index}").ToArray(),
            out _,
            out _));
    }
}
