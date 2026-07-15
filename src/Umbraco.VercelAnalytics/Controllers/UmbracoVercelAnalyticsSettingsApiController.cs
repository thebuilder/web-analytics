using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Security;
using Umbraco.Extensions;
using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;
using Umbraco.VercelAnalytics.Services;

namespace Umbraco.VercelAnalytics.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Umbraco.VercelAnalytics")]
public sealed class UmbracoVercelAnalyticsSettingsApiController(
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor,
    VercelAnalyticsSettingsStore settingsStore,
    VercelAnalyticsConnectionRegistry registry,
    IVercelAnalyticsClient vercelClient) : UmbracoVercelAnalyticsApiControllerBase
{
    [HttpGet("settings")]
    [ProducesResponseType<AnalyticsSettingsResponse>(StatusCodes.Status200OK)]
    public ActionResult<AnalyticsSettingsResponse> Settings()
    {
        if (!IsAdministrator()) return Forbid();
        return Ok(CreateResponse());
    }

    [HttpPut("settings")]
    [ProducesResponseType<AnalyticsSettingsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<AnalyticsSettingsResponse> SaveSettings(UpdateAnalyticsSettingsRequest request)
    {
        if (!IsAdministrator()) return Forbid();
        if (!TimeSpan.TryParse(request.CacheDuration, out var cacheDuration))
            return InvalidSettings(["Cache duration must use the format hh:mm:ss."]);

        var settings = new VercelAnalyticsSettings
        {
            Enabled = request.Enabled,
            DefaultConnection = request.DefaultConnection,
            DefaultRangeDays = request.DefaultRangeDays,
            CacheDuration = cacheDuration,
            Connections = request.Connections.Select(connection => new VercelAnalyticsConnectionSettings
            {
                Alias = connection.Alias,
                DisplayName = connection.DisplayName,
                ProjectId = connection.ProjectId,
                TeamId = connection.TeamId,
                TeamSlug = connection.TeamSlug,
                Hostnames = connection.Hostnames.ToArray(),
                DocumentRootKeys = connection.DocumentRootKeys.ToArray(),
                EnableAllDocumentTypes = connection.EnableAllDocumentTypes,
                EnabledDocumentTypeKeys = connection.EnabledDocumentTypeKeys.ToArray()
            }).ToList()
        };
        var failures = VercelAnalyticsSettingsValidator.Validate(settings);
        if (failures.Count > 0) return InvalidSettings(failures);

        settingsStore.Save(settings);
        return Ok(CreateResponse());
    }

    [HttpPost("settings/connections/{alias}/test")]
    [ProducesResponseType<AnalyticsConnectionTestResult>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AnalyticsConnectionTestResult>> TestConnection(
        string alias,
        CancellationToken cancellationToken)
    {
        if (!IsAdministrator()) return Forbid();
        var connection = registry.Get(alias);
        if (connection is null) return NotFound();
        if (!connection.IsConfigured)
            return Ok(new AnalyticsConnectionTestResult(false, "Add a server-side access token for this connection alias."));

        try
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            await vercelClient.CountAsync(
                connection,
                new AnalyticsQuery(alias, today.AddDays(-1), today, AnalyticsInterval.Day),
                cancellationToken);
            return Ok(new AnalyticsConnectionTestResult(true, "Vercel accepted the token and project configuration."));
        }
        catch (VercelAnalyticsApiException exception)
        {
            var message = exception.StatusCode switch
            {
                System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden =>
                    "Vercel rejected the token or its project/team permissions.",
                System.Net.HttpStatusCode.PaymentRequired =>
                    "Web Analytics is unavailable for the current Vercel plan or reporting window.",
                System.Net.HttpStatusCode.BadRequest =>
                    "Vercel rejected the project or team configuration.",
                _ => "Vercel Analytics is temporarily unavailable."
            };
            return Ok(new AnalyticsConnectionTestResult(false, message));
        }
    }

    private AnalyticsSettingsResponse CreateResponse()
    {
        var settings = settingsStore.Get();
        var connections = registry.Connections.ToDictionary(connection => connection.Alias, StringComparer.OrdinalIgnoreCase);
        return new AnalyticsSettingsResponse(
            settings.Enabled,
            settings.DefaultConnection,
            settings.DefaultRangeDays,
            settings.CacheDuration.ToString("c"),
            settings.Connections.Select(connection => new AnalyticsConnectionSettingsResponse(
                connection.Alias,
                connection.DisplayName,
                connection.ProjectId,
                connection.TeamId,
                connection.TeamSlug,
                connection.Hostnames,
                connection.DocumentRootKeys,
                connection.EnableAllDocumentTypes,
                connection.EnabledDocumentTypeKeys,
                connections.GetValueOrDefault(connection.Alias)?.IsConfigured is true)).ToArray());
    }

    private bool IsAdministrator() =>
        backOfficeSecurityAccessor.BackOfficeSecurity?.CurrentUser?.IsAdmin() is true;

    private ActionResult InvalidSettings(IReadOnlyList<string> failures) =>
        Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Analytics settings are invalid.",
            detail: string.Join(" ", failures));
}
