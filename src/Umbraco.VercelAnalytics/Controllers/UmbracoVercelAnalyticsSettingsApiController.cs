using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
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
    IOptions<VercelAnalyticsOptions> serverOptions,
    IVercelAnalyticsClient vercelClient,
    IVercelProjectNameService projectNames) : UmbracoVercelAnalyticsApiControllerBase
{
    [HttpGet("settings")]
    [ProducesResponseType<AnalyticsSettingsResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AnalyticsSettingsResponse>> Settings(CancellationToken cancellationToken)
    {
        if (!IsAdministrator()) return Forbid();
        return Ok(await CreateResponseAsync(cancellationToken));
    }

    [HttpPut("settings")]
    [ProducesResponseType<AnalyticsSettingsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AnalyticsSettingsResponse>> SaveSettings(
        UpdateAnalyticsSettingsRequest request,
        CancellationToken cancellationToken)
    {
        if (!IsAdministrator()) return Forbid();
        if (!TimeSpan.TryParse(request.CacheDuration, out var cacheDuration))
            return InvalidSettings(["Cache duration must use the format hh:mm:ss."]);

        var settings = new VercelAnalyticsSettings
        {
            Enabled = request.Enabled,
            DefaultRangeDays = request.DefaultRangeDays,
            CacheDuration = cacheDuration,
            Connections = request.Connections.Select(connection => new VercelAnalyticsConnectionSettings
            {
                Key = connection.Key,
                DisplayName = connection.DisplayName,
                ProjectId = connection.ProjectId,
                Team = connection.Team,
                MockScenario = connection.MockScenario,
                DocumentRootKeys = connection.DocumentRootKeys.ToArray(),
                EnableAllDocumentTypes = connection.EnableAllDocumentTypes,
                EnabledDocumentTypeKeys = connection.EnabledDocumentTypeKeys.ToArray()
            }).ToList()
        };
        var failures = VercelAnalyticsSettingsValidator.Validate(settings);
        if (failures.Count > 0) return InvalidSettings(failures);

        settingsStore.Save(settings);
        return Ok(await CreateResponseAsync(cancellationToken));
    }

    [HttpPost("settings/connections/{key:guid}/test")]
    [ProducesResponseType<AnalyticsConnectionTestResult>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AnalyticsConnectionTestResult>> TestConnection(
        Guid key,
        CancellationToken cancellationToken)
    {
        if (!IsAdministrator()) return Forbid();
        var connection = registry.Get(key);
        if (connection is null) return NotFound();
        if (!connection.IsConfigured)
            return Ok(new AnalyticsConnectionTestResult(false, "Add a server-side Vercel access token."));

        try
        {
            var now = DateTimeOffset.UtcNow;
            await vercelClient.CountAsync(
                connection,
                new AnalyticsQuery(key, now.AddDays(-1), now, AnalyticsInterval.Hour),
                cancellationToken);
            return Ok(new AnalyticsConnectionTestResult(true, "The analytics connection is ready."));
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
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Ok(new AnalyticsConnectionTestResult(false, "Vercel Analytics did not respond before the request timed out."));
        }
        catch (HttpRequestException)
        {
            return Ok(new AnalyticsConnectionTestResult(false, "Vercel Analytics could not be reached."));
        }
        catch (System.Text.Json.JsonException)
        {
            return Ok(new AnalyticsConnectionTestResult(false, "Vercel returned an unexpected analytics response."));
        }
    }

    private async Task<AnalyticsSettingsResponse> CreateResponseAsync(CancellationToken cancellationToken)
    {
        var settings = settingsStore.Get();
        var serverConfiguration = serverOptions.Value;
        var connections = registry.Connections.ToDictionary(connection => connection.Key);
        var responseTasks = settings.Connections.Select(async connection =>
        {
            var registered = connections.GetValueOrDefault(connection.Key);
            var displayName = connection.IsMock
                ? connection.DisplayName
                : registered is null
                    ? connection.ProjectId
                    : await projectNames.GetDisplayNameAsync(registered, cancellationToken);
            return new AnalyticsConnectionSettingsResponse(
                connection.Key,
                displayName,
                connection.ProjectId,
                connection.Team,
                connection.DocumentRootKeys,
                connection.EnableAllDocumentTypes,
                connection.EnabledDocumentTypeKeys,
                registered?.HasAccessToken is true,
                !string.IsNullOrWhiteSpace(serverConfiguration.ConnectionAccessTokens.GetValueOrDefault(connection.Key.ToString())),
                connection.MockScenario);
        });
        var responseConnections = await Task.WhenAll(responseTasks);
        return new AnalyticsSettingsResponse(
            settings.Enabled,
            !string.IsNullOrWhiteSpace(serverConfiguration.AccessToken),
            registry.MockConnectionsEnabled,
            settings.DefaultRangeDays,
            settings.CacheDuration.ToString("c"),
            responseConnections);
    }

    private bool IsAdministrator() =>
        backOfficeSecurityAccessor.BackOfficeSecurity?.CurrentUser?.IsAdmin() is true;

    private ActionResult InvalidSettings(IReadOnlyList<string> failures) =>
        Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Analytics settings are invalid.",
            detail: string.Join(" ", failures));
}
