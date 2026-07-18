using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Services.AuthorizationStatus;

namespace TheBuilder.WebAnalytics.Services;

public interface IAnalyticsAuthorizationService
{
    bool HasAnalyticsSectionAccess();

    bool HasContentSectionAccess();

    Task<bool> CanBrowseDocumentAsync(Guid documentId);
}

public sealed class AnalyticsAuthorizationService(
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor,
    IContentPermissionService contentPermissionService) : IAnalyticsAuthorizationService
{
    public bool HasAnalyticsSectionAccess()
        => HasSectionAccess(Constants.SectionAlias);

    public bool HasContentSectionAccess()
        => HasSectionAccess(Umbraco.Cms.Core.Constants.Applications.Content);

    private bool HasSectionAccess(string sectionAlias)
    {
        var security = backOfficeSecurityAccessor.BackOfficeSecurity;
        var user = security?.CurrentUser;
        return user is not null && security!.UserHasSectionAccess(sectionAlias, user);
    }

    public async Task<bool> CanBrowseDocumentAsync(Guid documentId)
    {
        var user = backOfficeSecurityAccessor.BackOfficeSecurity?.CurrentUser;
        if (user is null) return false;

        var status = await contentPermissionService.AuthorizeAccessAsync(
            user,
            documentId,
            ActionBrowse.ActionLetter);
        return status == ContentAuthorizationStatus.Success;
    }
}
