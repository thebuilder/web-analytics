using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class AnalyticsPublishedCulturesTests
{
    [Fact]
    public void Invariant_document_uses_the_requested_domain_culture()
    {
        var cultures = AnalyticsPublishedCultures.Resolve([], "da");

        Assert.Equal(["da"], cultures);
    }

    [Fact]
    public void Invariant_document_with_empty_culture_key_uses_the_requested_domain_culture()
    {
        var cultures = AnalyticsPublishedCultures.Resolve([string.Empty], "da");

        Assert.Equal(["da"], cultures);
    }

    [Fact]
    public void Variant_document_returns_only_the_requested_published_culture()
    {
        var cultures = AnalyticsPublishedCultures.Resolve(["en-US", "da-DK"], "DA-dk");

        Assert.Equal(["da-DK"], cultures);
    }

    [Fact]
    public void Missing_culture_keeps_all_published_routes()
    {
        var cultures = AnalyticsPublishedCultures.Resolve(["en-US", "da-DK"], null);

        Assert.Equal(["en-US", "da-DK"], cultures);
    }

    [Fact]
    public void Culture_specific_alternate_url_wins_over_the_contextual_primary_url()
    {
        var url = AnalyticsPublishedCultures.SelectUrl(
            "https://www.example.com/en/news/",
            [("da", "https://www.example.com/nyheder/")],
            "DA");

        Assert.Equal("https://www.example.com/nyheder/", url);
    }

    [Fact]
    public void Primary_url_is_used_when_no_alternate_matches_the_culture()
    {
        var url = AnalyticsPublishedCultures.SelectUrl(
            "https://www.example.com/en/news/",
            [("da", "https://www.example.com/nyheder/")],
            "en-US");

        Assert.Equal("https://www.example.com/en/news/", url);
    }
}
