using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.Routing;
using Umbraco.Cms.Core.Web;
using Umbraco.Extensions;

namespace TheBuilder.WebAnalytics.Services;

public interface IAnalyticsPublishedContentAccessor
{
    Task<AnalyticsPublishedDocument?> GetDocumentAsync(
        Guid documentId,
        string? currentCulture,
        CancellationToken cancellationToken);

    Task<string?> GetBaseUrlAsync(Guid documentId, CancellationToken cancellationToken);
}

public sealed record AnalyticsPublishedDocument(
    string ContentTypeAlias,
    Guid ContentTypeKey,
    IReadOnlyList<AnalyticsPublishedRoute> Routes);

public sealed record AnalyticsPublishedRoute(
    string Culture,
    string Hostname,
    string Path,
    string Url);

public sealed class UmbracoAnalyticsPublishedContentAccessor(
    IUmbracoContextFactory umbracoContextFactory,
    IPublishedUrlProvider publishedUrlProvider) : IAnalyticsPublishedContentAccessor
{
    public async Task<AnalyticsPublishedDocument?> GetDocumentAsync(
        Guid documentId,
        string? currentCulture,
        CancellationToken cancellationToken)
    {
        using var contextReference = umbracoContextFactory.EnsureUmbracoContext();
        var publishedContent = contextReference.UmbracoContext.Content;
        if (publishedContent is null) return null;

        var content = await publishedContent.GetByIdAsync(documentId);
        if (content is null) return null;

        var routes = new List<AnalyticsPublishedRoute>();
        var cultures = AnalyticsPublishedCultures.Resolve(content.Cultures.Keys, currentCulture);
        var alternateUrls = publishedUrlProvider.GetOtherUrls(content.Id)
            .Where(url => url.Url is not null)
            .Select(url => (url.Culture, url.Url!.ToString()))
            .ToArray();
        foreach (var culture in cultures)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var primaryUrl = content.Url(publishedUrlProvider, NullIfEmpty(culture), UrlMode.Absolute);
            var url = AnalyticsPublishedCultures.SelectUrl(primaryUrl, alternateUrls, culture);
            if (string.IsNullOrWhiteSpace(url) || url == "#") continue;

            var absolute = Uri.TryCreate(url, UriKind.Absolute, out var uri);
            routes.Add(new AnalyticsPublishedRoute(
                culture,
                absolute ? uri!.Host : string.Empty,
                AnalyticsRequestPath.Normalize(absolute ? uri!.AbsolutePath : url),
                url));
        }

        return new AnalyticsPublishedDocument(content.ContentType.Alias, content.ContentType.Key, routes);
    }

    public async Task<string?> GetBaseUrlAsync(Guid documentId, CancellationToken cancellationToken)
    {
        using var contextReference = umbracoContextFactory.EnsureUmbracoContext();
        var publishedContent = contextReference.UmbracoContext.Content;
        if (publishedContent is null) return null;

        var content = await publishedContent.GetByIdAsync(documentId);
        if (content is null) return null;

        var cultures = content.Cultures.Count == 0 ? [string.Empty] : content.Cultures.Keys;
        foreach (var culture in cultures)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var url = content.Url(publishedUrlProvider, NullIfEmpty(culture), UrlMode.Absolute);
            if (Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
                (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp))
            {
                return uri.GetLeftPart(UriPartial.Authority);
            }
        }

        return null;
    }

    private static string? NullIfEmpty(string value) => value.Length == 0 ? null : value;
}

internal static class AnalyticsPublishedCultures
{
    public static IReadOnlyList<string> Resolve(IEnumerable<string> publishedCultures, string? currentCulture)
    {
        var cultures = publishedCultures
            .Where(culture => !string.IsNullOrWhiteSpace(culture))
            .ToArray();
        if (!string.IsNullOrWhiteSpace(currentCulture))
        {
            var matchingCulture = cultures.FirstOrDefault(culture =>
                string.Equals(culture, currentCulture, StringComparison.OrdinalIgnoreCase));
            if (matchingCulture is not null) return [matchingCulture];
            if (cultures.Length == 0) return [currentCulture];
        }

        return cultures.Length == 0 ? [string.Empty] : cultures;
    }

    public static string SelectUrl(
        string primaryUrl,
        IEnumerable<(string? Culture, string Url)> alternateUrls,
        string culture)
    {
        if (culture.Length == 0) return primaryUrl;

        foreach (var alternateUrl in alternateUrls)
        {
            if (string.Equals(alternateUrl.Culture, culture, StringComparison.OrdinalIgnoreCase))
            {
                return alternateUrl.Url;
            }
        }

        return primaryUrl;
    }
}
