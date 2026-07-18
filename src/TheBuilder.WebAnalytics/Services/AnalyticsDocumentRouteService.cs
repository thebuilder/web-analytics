using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public interface IAnalyticsDocumentRouteService
{
    Task<string?> GetConnectionBaseUrlAsync(
        VercelAnalyticsConnection connection,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AnalyticsDocumentRoute>> GetRoutesAsync(
        Guid documentId,
        string? currentCulture,
        CancellationToken cancellationToken);
}

public sealed class AnalyticsDocumentRouteService(
    IContentService contentService,
    IAnalyticsPublishedContentAccessor publishedContent,
    VercelAnalyticsConnectionRegistry registry) : IAnalyticsDocumentRouteService
{
    public async Task<string?> GetConnectionBaseUrlAsync(
        VercelAnalyticsConnection connection,
        CancellationToken cancellationToken)
    {
        foreach (var rootKey in connection.DocumentRootKeys)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var baseUrl = await publishedContent.GetBaseUrlAsync(rootKey, cancellationToken);
            if (baseUrl is not null) return baseUrl;
        }

        return null;
    }

    public async Task<IReadOnlyList<AnalyticsDocumentRoute>> GetRoutesAsync(
        Guid documentId,
        string? currentCulture,
        CancellationToken cancellationToken)
    {
        var content = contentService.GetById(documentId);
        if (content is null) return [];

        var rootConnection = FindRootConnection(content);
        var published = await publishedContent.GetDocumentAsync(documentId, currentCulture, cancellationToken);
        if (published is null) return [];

        var routes = new List<AnalyticsDocumentRoute>();
        foreach (var publishedRoute in published.Routes)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var connection = rootConnection;
            if (connection is null ||
                !connection.IsDocumentTypeEnabled(published.ContentTypeAlias, published.ContentTypeKey)) continue;

            routes.Add(new AnalyticsDocumentRoute(
                connection.Key,
                publishedRoute.Culture,
                publishedRoute.Hostname,
                publishedRoute.Path,
                publishedRoute.Url,
                string.Equals(publishedRoute.Culture, currentCulture, StringComparison.OrdinalIgnoreCase),
                []));
        }

        return routes;
    }

    private VercelAnalyticsConnection? FindRootConnection(IContent content)
    {
        var ancestorKeys = new List<Guid>();
        var current = content;
        while (current is not null)
        {
            ancestorKeys.Add(current.Key);
            current = current.ParentId > 0 ? contentService.GetById(current.ParentId) : null;
        }

        return registry.FindNearestRoot(ancestorKeys);
    }

}
