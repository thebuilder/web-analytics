using Moq;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.Services;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Services;

public sealed class AnalyticsAuthorizationServiceTests
{
    [Fact]
    public async Task Anonymous_backoffice_context_has_no_section_or_document_access()
    {
        var security = new Mock<IBackOfficeSecurityAccessor>(MockBehavior.Strict);
        security.SetupGet(accessor => accessor.BackOfficeSecurity).Returns((IBackOfficeSecurity?)null);
        var permissions = new Mock<IContentPermissionService>(MockBehavior.Strict);
        var authorization = new AnalyticsAuthorizationService(security.Object, permissions.Object);

        Assert.False(authorization.HasAnalyticsSectionAccess());
        Assert.False(authorization.HasContentSectionAccess());
        Assert.False(await authorization.CanBrowseDocumentAsync(Guid.NewGuid()));
        permissions.VerifyNoOtherCalls();
    }
}
