using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Moq;
using Umbraco.Cms.Web.Common.Authorization;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Controllers;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Controllers;

public sealed class WebAnalyticsApiControllerTests
{
    private static readonly Guid MainKey = Guid.Parse("11111111-1111-1111-1111-111111111110");
    private static readonly Guid SecondaryKey = Guid.Parse("22222222-2222-2222-2222-222222222220");
    [Fact]
    public void Base_controller_requires_authenticated_backoffice_access()
    {
        var authorize = Assert.Single(
            typeof(WebAnalyticsApiControllerBase)
                .GetCustomAttributes<AuthorizeAttribute>());

        Assert.Equal(AuthorizationPolicies.BackOfficeAccess, authorize.Policy);
    }

    [Fact]
    public async Task Connections_forbids_users_without_analytics_section_access()
    {
        var authorization = new Mock<IAnalyticsAuthorizationService>(MockBehavior.Strict);
        authorization.Setup(service => service.HasAnalyticsSectionAccess()).Returns(false);
        var controller = new WebAnalyticsApiController(
            authorization.Object,
            null!,
            null!,
            null!,
            null!);

        var response = await controller.Connections(CancellationToken.None);

        Assert.IsType<ForbidResult>(response.Result);
    }

    [Fact]
    public async Task Connections_resolves_connection_base_urls_concurrently()
    {
        var authorization = new Mock<IAnalyticsAuthorizationService>(MockBehavior.Strict);
        authorization.Setup(service => service.HasAnalyticsSectionAccess()).Returns(true);
        var allStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var started = 0;
        var routes = new Mock<IAnalyticsDocumentRouteService>(MockBehavior.Strict);
        var projectNames = new Mock<IAnalyticsConnectionNameService>(MockBehavior.Strict);
        projectNames
            .Setup(service => service.GetDisplayNameAsync(
                It.IsAny<AnalyticsConnection>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((AnalyticsConnection connection, CancellationToken _) => connection.DisplayName);
        routes
            .Setup(service => service.GetConnectionBaseUrlAsync(
                It.IsAny<AnalyticsConnection>(),
                It.IsAny<CancellationToken>()))
            .Returns(async () =>
            {
                if (Interlocked.Increment(ref started) == 2) allStarted.TrySetResult();
                await release.Task;
                return "https://example.com";
            });
        var controller = new WebAnalyticsApiController(
            authorization.Object,
            EnabledRegistry("main", "secondary"),
            null!,
            routes.Object,
            projectNames.Object);

        var responseTask = controller.Connections(CancellationToken.None);
        await allStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
        release.SetResult();
        var response = await responseTask;

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        var payload = Assert.IsType<AnalyticsConnectionsResponse>(ok.Value);
        Assert.Equal(2, payload.Connections.Count);
        Assert.Equal([MainKey, SecondaryKey], payload.Connections.Select(connection => connection.Key));
        Assert.True(payload.Connections[0].IsDefault);
        Assert.False(payload.Connections[1].IsDefault);
    }

    [Fact]
    public async Task Mock_connection_without_token_or_document_mappings_is_ready_without_warnings()
    {
        var authorization = new Mock<IAnalyticsAuthorizationService>(MockBehavior.Strict);
        authorization.Setup(service => service.HasAnalyticsSectionAccess()).Returns(true);
        var routes = new Mock<IAnalyticsDocumentRouteService>(MockBehavior.Strict);
        routes.Setup(service => service.GetConnectionBaseUrlAsync(
                It.IsAny<AnalyticsConnection>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        var projectNames = new Mock<IAnalyticsConnectionNameService>(MockBehavior.Strict);
        projectNames.Setup(service => service.GetDisplayNameAsync(
                It.IsAny<AnalyticsConnection>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync("Demo");
        var options = Options.Create(new WebAnalyticsOptions());
        var store = new WebAnalyticsSettingsStore(options);
        store.Save(new WebAnalyticsSettings
        {
            Enabled = true,
            Connections =
            [
                new()
                {
                    Key = MainKey,
                    DisplayName = "Demo",
                    MockScenario = MockAnalyticsScenario.Complete
                }
            ]
        });
        var registry = new AnalyticsConnectionRegistry(store, options, mockConnectionsEnabled: true);
        var controller = new WebAnalyticsApiController(
            authorization.Object,
            registry,
            null!,
            routes.Object,
            projectNames.Object);

        var response = await controller.Connections(CancellationToken.None);

        var payload = Assert.IsType<AnalyticsConnectionsResponse>(Assert.IsType<OkObjectResult>(response.Result).Value);
        var connection = Assert.Single(payload.Connections);
        Assert.True(connection.IsConfigured);
        Assert.Empty(connection.Warnings);
    }

    [Fact]
    public async Task Document_routes_forbid_users_without_document_browse_permission()
    {
        var documentId = Guid.NewGuid();
        var authorization = new Mock<IAnalyticsAuthorizationService>(MockBehavior.Strict);
        authorization
            .Setup(service => service.CanBrowseDocumentAsync(documentId))
            .ReturnsAsync(false);
        var controller = new WebAnalyticsApiController(
            authorization.Object,
            null!,
            null!,
            null!,
            null!);

        var response = await controller.DocumentRoutes(documentId, null, CancellationToken.None);

        Assert.IsType<ForbidResult>(response.Result);
    }

    [Fact]
    public async Task Document_summary_rejects_a_path_not_returned_for_the_document()
    {
        var documentId = Guid.NewGuid();
        var authorization = new Mock<IAnalyticsAuthorizationService>(MockBehavior.Strict);
        authorization
            .Setup(service => service.HasContentSectionAccess())
            .Returns(true);
        authorization
            .Setup(service => service.CanBrowseDocumentAsync(documentId))
            .ReturnsAsync(true);
        var routes = new Mock<IAnalyticsDocumentRouteService>(MockBehavior.Strict);
        routes.Setup(service => service.GetRoutesAsync(documentId, "en-US", It.IsAny<CancellationToken>()))
            .ReturnsAsync([
                new AnalyticsDocumentRoute(
                    MainKey,
                    "en-US",
                    "example.com",
                    "/published",
                    "https://example.com/published",
                    true,
                    [])
            ]);
        var controller = new WebAnalyticsApiController(
            authorization.Object,
            EnabledRegistry(),
            null!,
            routes.Object,
            null!);

        var response = await controller.Summary(
            MainKey,
            UtcDate(2026, 7, 1),
            UtcDate(2026, 7, 3),
            AnalyticsInterval.Day,
            documentId,
            "en-US",
            "/not-this-document",
            null,
            CancellationToken.None);

        AssertInvalidQuery(response.Result);
        authorization.VerifyAll();
        routes.VerifyAll();
    }

    [Fact]
    public async Task Document_summary_forbids_users_without_content_section_access_even_when_they_can_browse_the_document()
    {
        var documentId = Guid.NewGuid();
        var authorization = new Mock<IAnalyticsAuthorizationService>(MockBehavior.Strict);
        authorization
            .Setup(service => service.HasContentSectionAccess())
            .Returns(false);
        var controller = new WebAnalyticsApiController(
            authorization.Object,
            EnabledRegistry(),
            null!,
            null!,
            null!);

        var response = await controller.Summary(
            MainKey,
            UtcDate(2026, 7, 1),
            UtcDate(2026, 7, 3),
            AnalyticsInterval.Day,
            documentId,
            "en-US",
            "/published",
            null,
            CancellationToken.None);

        Assert.IsType<ForbidResult>(response.Result);
        authorization.VerifyAll();
    }

    [Fact]
    public async Task Breakdown_rejects_undefined_numeric_dimension_before_dispatch()
    {
        var controller = CreateBoundaryOnlyController();

        var response = await controller.Breakdown(
            (AnalyticsDimension)999,
            MainKey,
            UtcDate(2026, 7, 1),
            UtcDate(2026, 7, 3),
            AnalyticsInterval.Day);

        AssertInvalidQuery(response.Result);
    }

    [Fact]
    public async Task Summary_rejects_undefined_numeric_interval_before_dispatch()
    {
        var controller = CreateBoundaryOnlyController();

        var response = await controller.Summary(
            MainKey,
            UtcDate(2026, 7, 1),
            UtcDate(2026, 7, 3),
            (AnalyticsInterval)999,
            null,
            null,
            null,
            null,
            CancellationToken.None);

        AssertInvalidQuery(response.Result);
    }

    [Fact]
    public async Task Summary_rejects_event_name_filter_in_visit_scope_before_dispatch()
    {
        var controller = CreateBoundaryOnlyController();

        var response = await controller.Summary(
            MainKey,
            UtcDate(2026, 7, 1),
            UtcDate(2026, 7, 3),
            AnalyticsInterval.Day,
            null,
            null,
            null,
            ["EventName:Signup"],
            CancellationToken.None);

        AssertInvalidQuery(response.Result);
        var problem = Assert.IsType<AnalyticsProblemDetails>(Assert.IsType<ObjectResult>(response.Result).Value);
        Assert.Contains("only supported by the event list report", problem.Detail);
    }

    [Fact]
    public async Task Summary_rejects_filters_not_supported_by_the_selected_provider()
    {
        var authorization = new Mock<IAnalyticsAuthorizationService>(MockBehavior.Strict);
        authorization.Setup(service => service.HasAnalyticsSectionAccess()).Returns(true);
        var controller = new WebAnalyticsApiController(
            authorization.Object,
            PlausibleRegistry(),
            null!,
            null!,
            null!);

        var response = await controller.Summary(
            MainKey,
            UtcDate(2026, 7, 1),
            UtcDate(2026, 7, 3),
            AnalyticsInterval.Day,
            null,
            null,
            null,
            ["Route:/articles/[slug]"],
            CancellationToken.None);

        AssertInvalidQuery(response.Result);
        var problem = Assert.IsType<AnalyticsProblemDetails>(Assert.IsType<ObjectResult>(response.Result).Value);
        Assert.Contains("does not support Route filters", problem.Detail);
    }

    [Fact]
    public async Task Event_details_rejects_event_name_filter_from_the_shared_query()
    {
        var controller = CreateBoundaryOnlyController();

        var response = await controller.EventDetails(
            MainKey,
            UtcDate(2026, 7, 1),
            UtcDate(2026, 7, 3),
            AnalyticsInterval.Day,
            "Signup",
            filter: ["EventName:AnotherEvent"]);

        AssertInvalidQuery(response.Result);
    }

    [Fact]
    public async Task Event_property_values_reject_event_name_filter_from_the_shared_query()
    {
        var controller = CreateBoundaryOnlyController();

        var response = await controller.EventPropertyValues(
            MainKey,
            UtcDate(2026, 7, 1),
            UtcDate(2026, 7, 3),
            AnalyticsInterval.Day,
            "Signup",
            "plan",
            filter: ["EventName:AnotherEvent"]);

        AssertInvalidQuery(response.Result);
    }

    private static WebAnalyticsApiController CreateBoundaryOnlyController() =>
        new(null!, null!, null!, null!, null!);

    private static DateTimeOffset UtcDate(int year, int month, int day) =>
        new(year, month, day, 0, 0, 0, TimeSpan.Zero);

    private static AnalyticsConnectionRegistry EnabledRegistry(params string[] aliases) =>
        new(Options.Create(new WebAnalyticsOptions
        {
            Enabled = true,
            Providers = { Vercel = { AccessToken = "secret" } },
            Connections = (aliases.Length == 0 ? ["main"] : aliases).Select(
                alias => new AnalyticsConnectionOptions
                {
                    Key = alias == "secondary" ? SecondaryKey : MainKey,
                    DisplayName = alias,
                    ProjectId = "project",
                    DocumentRootKeys = [Guid.NewGuid().ToString()],
                    EnableAllDocumentTypes = true
                }).ToList()
        }));

    private static AnalyticsConnectionRegistry PlausibleRegistry() =>
        new(Options.Create(new WebAnalyticsOptions
        {
            Enabled = true,
            Providers = { Plausible = { AccessToken = "secret" } },
            Connections =
            [
                new()
                {
                    Key = MainKey,
                    Provider = AnalyticsProvider.Plausible,
                    DisplayName = "Plausible",
                    SiteId = "example.com",
                    EnableAllDocumentTypes = true
                }
            ]
        }));

    private static void AssertInvalidQuery(ActionResult? result)
    {
        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, objectResult.StatusCode);
        var problem = Assert.IsType<AnalyticsProblemDetails>(objectResult.Value);
        Assert.Equal(WebAnalyticsProblemCodes.InvalidQuery, problem.Code);
    }
}
