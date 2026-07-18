using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Moq;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Controllers;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Controllers;

public sealed class WebAnalyticsSettingsApiControllerTests
{
    private static readonly Guid MockKey = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Settings_preserve_mock_identity_and_report_runtime_availability(bool mockConnectionsEnabled)
    {
        var options = Options.Create(new VercelAnalyticsOptions());
        var store = new VercelAnalyticsSettingsStore(options);
        store.Save(new VercelAnalyticsSettings
        {
            Enabled = true,
            Connections =
            [
                new()
                {
                    Key = MockKey,
                    DisplayName = "Mock · Feature flags",
                    MockScenario = MockAnalyticsScenario.Flags
                }
            ]
        });
        var registry = new VercelAnalyticsConnectionRegistry(store, options, mockConnectionsEnabled);
        var controller = new WebAnalyticsSettingsApiController(
            CreateAdministratorSecurityAccessor(),
            store,
            registry,
            options,
            Mock.Of<IVercelAnalyticsClient>(MockBehavior.Strict),
            Mock.Of<IVercelProjectNameService>(MockBehavior.Strict));

        var result = await controller.Settings(CancellationToken.None);

        var response = Assert.IsType<AnalyticsSettingsResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var connection = Assert.Single(response.Connections);
        Assert.Equal(MockAnalyticsScenario.Flags, connection.MockScenario);
        Assert.Equal(mockConnectionsEnabled, response.CanCreateMockConnections);
    }

    private static IBackOfficeSecurityAccessor CreateAdministratorSecurityAccessor()
    {
        var administratorGroup = new Mock<IReadOnlyUserGroup>();
        administratorGroup.SetupGet(group => group.Alias).Returns("admin");
        var user = new Mock<IUser>();
        user.SetupGet(value => value.Groups).Returns([administratorGroup.Object]);
        var security = new Mock<IBackOfficeSecurity>();
        security.SetupGet(value => value.CurrentUser).Returns(user.Object);
        var accessor = new Mock<IBackOfficeSecurityAccessor>();
        accessor.SetupGet(value => value.BackOfficeSecurity).Returns(security.Object);
        return accessor.Object;
    }
}
