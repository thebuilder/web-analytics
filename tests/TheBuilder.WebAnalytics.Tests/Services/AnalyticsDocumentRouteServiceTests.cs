using Microsoft.Extensions.Options;
using Moq;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class AnalyticsDocumentRouteServiceTests
{
    private static readonly Guid RootConnectionKey = Guid.Parse("11111111-1111-1111-1111-111111111110");
    private static readonly Guid SiteConnectionKey = Guid.Parse("22222222-2222-2222-2222-222222222220");
    [Fact]
    public async Task Root_mapping_resolves_document_route()
    {
        var rootKey = Guid.NewGuid();
        var documentKey = Guid.NewGuid();
        var contentService = CreateContentTree(rootKey, documentKey);
        var published = CreatePublishedDocument("conflict.example", "/news", "en-US");
        var accessor = new Mock<IAnalyticsPublishedContentAccessor>();
        accessor.Setup(value => value.GetDocumentAsync(documentKey, "en-US", It.IsAny<CancellationToken>()))
            .ReturnsAsync(published);
        var service = new AnalyticsDocumentRouteService(
            contentService.Object,
            accessor.Object,
            CreateRegistry(
                Connection("root", roots: [rootKey])));

        var route = Assert.Single(await service.GetRoutesAsync(documentKey, "en-US", CancellationToken.None));

        Assert.Equal(RootConnectionKey, route.Connection);
        Assert.True(route.IsCurrent);
        Assert.Empty(route.Warnings);
    }

    [Fact]
    public async Task Document_without_mapped_root_has_no_routes()
    {
        var rootKey = Guid.NewGuid();
        var documentKey = Guid.NewGuid();
        var contentService = CreateContentTree(rootKey, documentKey);
        var accessor = new Mock<IAnalyticsPublishedContentAccessor>();
        accessor.Setup(value => value.GetDocumentAsync(documentKey, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(CreatePublishedDocument("www.example.com", "/about", string.Empty));
        var service = new AnalyticsDocumentRouteService(
            contentService.Object,
            accessor.Object,
            CreateRegistry(Connection("site")));

        var routes = await service.GetRoutesAsync(documentKey, null, CancellationToken.None);

        Assert.Empty(routes);
    }

    [Fact]
    public async Task Disabled_document_type_has_no_routes()
    {
        var rootKey = Guid.NewGuid();
        var documentKey = Guid.NewGuid();
        var contentService = CreateContentTree(rootKey, documentKey);
        var accessor = new Mock<IAnalyticsPublishedContentAccessor>();
        accessor.Setup(value => value.GetDocumentAsync(documentKey, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(CreatePublishedDocument("www.example.com", "/about", string.Empty));
        var service = new AnalyticsDocumentRouteService(
            contentService.Object,
            accessor.Object,
            CreateRegistry(Connection("site", roots: [rootKey], documentTypes: ["homePage"])));

        var routes = await service.GetRoutesAsync(documentKey, null, CancellationToken.None);

        Assert.Empty(routes);
    }

    [Fact]
    public async Task All_published_cultures_are_returned_and_the_active_culture_is_marked()
    {
        var rootKey = Guid.NewGuid();
        var documentKey = Guid.NewGuid();
        var contentService = CreateContentTree(rootKey, documentKey);
        var accessor = new Mock<IAnalyticsPublishedContentAccessor>();
        accessor.Setup(value => value.GetDocumentAsync(documentKey, "da-DK", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnalyticsPublishedDocument(
                "articlePage",
                Guid.NewGuid(),
                [
                    new("en-US", "www.example.com", "/news", "https://www.example.com/news"),
                    new("da-DK", "www.example.dk", "/nyheder", "https://www.example.dk/nyheder")
                ]));
        var service = new AnalyticsDocumentRouteService(
            contentService.Object,
            accessor.Object,
            CreateRegistry(Connection("site", roots: [rootKey])));

        var routes = await service.GetRoutesAsync(documentKey, "da-DK", CancellationToken.None);

        Assert.Equal(2, routes.Count);
        Assert.False(routes.Single(route => route.Culture == "en-US").IsCurrent);
        Assert.True(routes.Single(route => route.Culture == "da-DK").IsCurrent);
    }

    [Fact]
    public async Task Unpublished_document_has_no_routes()
    {
        var rootKey = Guid.NewGuid();
        var documentKey = Guid.NewGuid();
        var contentService = CreateContentTree(rootKey, documentKey);
        var accessor = new Mock<IAnalyticsPublishedContentAccessor>();
        accessor.Setup(value => value.GetDocumentAsync(documentKey, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync((AnalyticsPublishedDocument?)null);
        var service = new AnalyticsDocumentRouteService(
            contentService.Object,
            accessor.Object,
            CreateRegistry(Connection("site", roots: [rootKey])));

        var routes = await service.GetRoutesAsync(documentKey, null, CancellationToken.None);

        Assert.Empty(routes);
    }

    [Fact]
    public async Task Document_root_provides_base_url()
    {
        var rootKey = Guid.NewGuid();
        var accessor = new Mock<IAnalyticsPublishedContentAccessor>();
        accessor.Setup(value => value.GetBaseUrlAsync(rootKey, It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://root.example");
        var service = new AnalyticsDocumentRouteService(
            Mock.Of<IContentService>(),
            accessor.Object,
            CreateRegistry(Connection("root", roots: [rootKey])));

        var baseUrl = await service.GetConnectionBaseUrlAsync(
            CreateRegistry(Connection("root", roots: [rootKey])).Get(RootConnectionKey)!,
            CancellationToken.None);

        Assert.Equal("https://root.example", baseUrl);
    }

    [Fact]
    public async Task Plausible_site_id_provides_base_url_without_a_document_root()
    {
        var connection = Connection("plausible");
        connection.Provider = AnalyticsProvider.Plausible;
        connection.ProjectId = string.Empty;
        connection.SiteId = "charlietango.dk";
        var registry = CreateRegistry(connection);
        var service = new AnalyticsDocumentRouteService(
            Mock.Of<IContentService>(),
            Mock.Of<IAnalyticsPublishedContentAccessor>(),
            registry);

        var baseUrl = await service.GetConnectionBaseUrlAsync(
            registry.Get(SiteConnectionKey)!,
            CancellationToken.None);

        Assert.Equal("https://charlietango.dk", baseUrl);
    }

    [Fact]
    public async Task Provider_without_a_fallback_and_document_root_has_no_base_url()
    {
        var registry = CreateRegistry(Connection("site"));
        var service = new AnalyticsDocumentRouteService(
            Mock.Of<IContentService>(),
            Mock.Of<IAnalyticsPublishedContentAccessor>(),
            registry);

        var baseUrl = await service.GetConnectionBaseUrlAsync(
            registry.Get(SiteConnectionKey)!,
            CancellationToken.None);

        Assert.Null(baseUrl);
    }

    private static Mock<IContentService> CreateContentTree(Guid rootKey, Guid documentKey)
    {
        var root = new Mock<IContent>();
        root.SetupGet(value => value.Id).Returns(10);
        root.SetupGet(value => value.Key).Returns(rootKey);
        root.SetupGet(value => value.ParentId).Returns(-1);

        var document = new Mock<IContent>();
        document.SetupGet(value => value.Id).Returns(20);
        document.SetupGet(value => value.Key).Returns(documentKey);
        document.SetupGet(value => value.ParentId).Returns(10);

        var service = new Mock<IContentService>();
        service.Setup(value => value.GetById(documentKey)).Returns(document.Object);
        service.Setup(value => value.GetById(20)).Returns(document.Object);
        service.Setup(value => value.GetById(10)).Returns(root.Object);
        return service;
    }

    private static AnalyticsPublishedDocument CreatePublishedDocument(string hostname, string path, string culture) => new(
        "articlePage",
        Guid.NewGuid(),
        [new AnalyticsPublishedRoute(culture, hostname, path, $"https://{hostname}{path}")]);

    private static AnalyticsConnectionOptions Connection(
        string alias,
        IReadOnlyList<Guid>? roots = null,
        IReadOnlyList<string>? documentTypes = null) => new()
        {
            Key = KeyFor(alias),
            DisplayName = alias,
            ProjectId = $"project-{alias}",
            DocumentRootKeys = roots?.Select(value => value.ToString()).ToArray() ?? [],
            EnabledDocumentTypes = documentTypes?.ToArray() ?? ["articlePage"]
        };

    private static AnalyticsConnectionRegistry CreateRegistry(params AnalyticsConnectionOptions[] connections)
    {
        var options = Options.Create(new WebAnalyticsOptions
        {
            Enabled = true,
            Providers =
            {
                Vercel = { AccessToken = "secret" },
                Plausible = { AccessToken = "plausible-secret" }
            },
            Connections = connections.ToList()
        });
        return new AnalyticsConnectionRegistry(new WebAnalyticsSettingsStore(options), options);
    }

    private static Guid KeyFor(string alias) => alias == "root" ? RootConnectionKey : SiteConnectionKey;
}
