using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class AnalyticsRequestPathTests
{
    [Theory]
    [InlineData("/nyheder/", "/nyheder")]
    [InlineData("/nyheder///", "/nyheder")]
    [InlineData("nyheder?preview=true#content", "/nyheder")]
    [InlineData("/", "/")]
    public void Published_paths_are_normalized_for_vercel_request_path_filters(string input, string expected)
    {
        Assert.Equal(expected, AnalyticsRequestPath.Normalize(input));
    }
}
