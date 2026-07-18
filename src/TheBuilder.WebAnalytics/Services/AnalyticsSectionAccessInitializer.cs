using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;

namespace TheBuilder.WebAnalytics.Services;

public sealed class AnalyticsSectionAccessInitializer(
    IUserGroupService userGroupService,
    IKeyValueService keyValueService,
    IRuntimeState runtimeState,
    ILogger<AnalyticsSectionAccessInitializer> logger)
    : INotificationAsyncHandler<UmbracoApplicationStartedNotification>
{
    private const string InitializationKey = "TheBuilder.WebAnalytics.AdministratorSectionAccess.v1";

    public async Task HandleAsync(
        UmbracoApplicationStartedNotification notification,
        CancellationToken cancellationToken)
    {
        if (runtimeState.Level != RuntimeLevel.Run || keyValueService.GetValue(InitializationKey) is not null)
        {
            return;
        }

        var administrators = await userGroupService.GetAsync(Umbraco.Cms.Core.Constants.Security.AdminGroupAlias);
        if (administrators is null)
        {
            logger.LogWarning("Could not grant the Web Analytics section because the Administrators group was not found.");
            return;
        }

        if (ShouldGrantAnalyticsSection(administrators.AllowedSections))
        {
            administrators.AddAllowedSection(Constants.SectionAlias);
            var result = await userGroupService.UpdateAsync(
                administrators,
                Umbraco.Cms.Core.Constants.Security.SuperUserKey);
            if (!result.Success)
            {
                logger.LogWarning("Could not grant the Web Analytics section to the Administrators group.");
                return;
            }
        }

        keyValueService.SetValue(InitializationKey, DateTimeOffset.UtcNow.ToString("O"));
    }

    internal static bool ShouldGrantAnalyticsSection(IEnumerable<string> allowedSections) =>
        !allowedSections.Contains(Constants.SectionAlias, StringComparer.OrdinalIgnoreCase);
}
