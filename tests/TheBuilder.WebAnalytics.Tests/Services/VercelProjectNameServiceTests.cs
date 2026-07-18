using Microsoft.Extensions.Caching.Memory;
using Moq;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class VercelProjectNameServiceTests
{
    [Fact]
    public async Task Resolves_and_caches_the_vercel_project_name()
    {
        var client = new Mock<IVercelAnalyticsClient>(MockBehavior.Strict);
        var connection = CreateConnection();
        client.Setup(item => item.GetProjectNameAsync(connection, It.IsAny<CancellationToken>()))
            .ReturnsAsync("health-platform");
        var service = new VercelProjectNameService(client.Object, new MemoryCache(new MemoryCacheOptions()));

        var first = await service.GetDisplayNameAsync(connection, CancellationToken.None);
        var second = await service.GetDisplayNameAsync(connection, CancellationToken.None);

        Assert.Equal("health-platform", first);
        Assert.Equal(first, second);
        client.Verify(item => item.GetProjectNameAsync(connection, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Falls_back_to_project_id_when_metadata_is_unavailable()
    {
        var client = new Mock<IVercelAnalyticsClient>(MockBehavior.Strict);
        var connection = CreateConnection();
        client.Setup(item => item.GetProjectNameAsync(connection, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new VercelAnalyticsApiException(System.Net.HttpStatusCode.Forbidden));
        var service = new VercelProjectNameService(client.Object, new MemoryCache(new MemoryCacheOptions()));

        var result = await service.GetDisplayNameAsync(connection, CancellationToken.None);

        Assert.Equal("project", result);
    }

    [Fact]
    public async Task Caches_project_names_per_connection_identity()
    {
        var client = new Mock<IVercelAnalyticsClient>(MockBehavior.Strict);
        client.Setup(item => item.GetProjectNameAsync(
                It.IsAny<VercelAnalyticsConnection>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((VercelAnalyticsConnection connection, CancellationToken _) => connection.DisplayName);
        var service = new VercelProjectNameService(client.Object, new MemoryCache(new MemoryCacheOptions()));
        var flags = CreateConnection() with
        {
            Key = Guid.Parse("22222222-2222-2222-2222-222222222220"),
            DisplayName = "Mock · Feature flags",
            AccessToken = string.Empty,
            ProjectId = string.Empty,
            Team = null,
            MockScenario = MockAnalyticsScenario.Flags
        };
        var events = flags with
        {
            Key = Guid.Parse("33333333-3333-3333-3333-333333333330"),
            DisplayName = "Mock · Custom events",
            MockScenario = MockAnalyticsScenario.Events
        };

        var flagName = await service.GetDisplayNameAsync(flags, CancellationToken.None);
        var eventName = await service.GetDisplayNameAsync(events, CancellationToken.None);

        Assert.Equal("Mock · Feature flags", flagName);
        Assert.Equal("Mock · Custom events", eventName);
        client.Verify(item => item.GetProjectNameAsync(
            It.IsAny<VercelAnalyticsConnection>(),
            It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    private static VercelAnalyticsConnection CreateConnection() => new(
        Guid.Parse("11111111-1111-1111-1111-111111111110"),
        "Old display name",
        "secret",
        "project",
        "team_123",
        [],
        true,
        new HashSet<Guid>(),
        new HashSet<string>());
}
