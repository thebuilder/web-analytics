using System.Net;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Services.AuthorizationStatus;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;
using Umbraco.VercelAnalytics.Services;

namespace Umbraco.VercelAnalytics.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Umbraco.VercelAnalytics")]
public sealed class UmbracoVercelAnalyticsApiController(
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor,
    IContentPermissionService contentPermissionService,
    VercelAnalyticsConnectionRegistry registry,
    VercelAnalyticsReportService reportService,
    AnalyticsDocumentRouteService routeService) : UmbracoVercelAnalyticsApiControllerBase
{
    [HttpGet("connections")]
    [ProducesResponseType<AnalyticsConnectionsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public ActionResult<AnalyticsConnectionsResponse> Connections()
    {
        if (!HasAnalyticsSectionAccess()) return Forbid();
        var response = new AnalyticsConnectionsResponse(
            registry.Settings.Enabled,
            registry.Settings.DefaultConnection,
            registry.Settings.DefaultRangeDays,
            registry.Connections.Select(connection => new AnalyticsConnectionSummary(
                connection.Alias,
                connection.DisplayName,
                string.Equals(connection.Alias, registry.Settings.DefaultConnection, StringComparison.OrdinalIgnoreCase),
                connection.IsConfigured,
                connection.Hostnames.Order(StringComparer.OrdinalIgnoreCase).ToArray(),
                ConnectionWarnings(connection))).OrderBy(connection => connection.DisplayName).ToArray());
        return Ok(response);
    }

    [HttpGet("documents/{documentId:guid}/routes")]
    [Authorize(Policy = AuthorizationPolicies.SectionAccessContent)]
    [ProducesResponseType<IReadOnlyList<AnalyticsDocumentRoute>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AnalyticsDocumentRoute>>> DocumentRoutes(
        Guid documentId,
        [FromQuery] string? culture,
        CancellationToken cancellationToken)
    {
        if (!await CanBrowseDocumentAsync(documentId)) return Forbid();
        return Ok(await routeService.GetRoutesAsync(documentId, culture, cancellationToken));
    }

    [HttpGet("reports/summary")]
    [ProducesResponseType<AnalyticsSummary>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AnalyticsSummary>> Summary(
        [FromQuery] string connection,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] AnalyticsInterval interval,
        [FromQuery] Guid? documentId,
        [FromQuery] string? culture,
        [FromQuery] string? path,
        CancellationToken cancellationToken)
    {
        var scope = await AuthorizeAndBuildQueryAsync(connection, from, to, interval, documentId, culture, path, cancellationToken);
        if (scope.Error is not null) return scope.Error;
        try
        {
            var report = await reportService.GetSummaryAsync(scope.Query!, cancellationToken);
            return report is null ? NotFoundProblem("The selected analytics connection does not exist.") : Ok(report);
        }
        catch (VercelAnalyticsApiException exception)
        {
            return VercelProblem(exception);
        }
    }

    [HttpGet("reports/breakdown/{dimension}")]
    [ProducesResponseType<AnalyticsBreakdown>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AnalyticsBreakdown>> Breakdown(
        AnalyticsDimension dimension,
        [FromQuery] string connection,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] AnalyticsInterval interval,
        [FromQuery] int limit = 10,
        [FromQuery] Guid? documentId = null,
        [FromQuery] string? culture = null,
        [FromQuery] string? path = null,
        CancellationToken cancellationToken = default)
    {
        if (limit is < 1 or > 100) return ValidationProblem("Limit must be between 1 and 100.");
        var scope = await AuthorizeAndBuildQueryAsync(connection, from, to, interval, documentId, culture, path, cancellationToken);
        if (scope.Error is not null) return scope.Error;
        try
        {
            var report = await reportService.GetBreakdownAsync(scope.Query!, dimension, limit, cancellationToken);
            return report is null ? NotFoundProblem("The selected analytics connection does not exist.") : Ok(report);
        }
        catch (VercelAnalyticsApiException exception)
        {
            return VercelProblem(exception);
        }
    }

    private async Task<(AnalyticsQuery? Query, ActionResult? Error)> AuthorizeAndBuildQueryAsync(
        string connection,
        DateOnly from,
        DateOnly to,
        AnalyticsInterval interval,
        Guid? documentId,
        string? culture,
        string? path,
        CancellationToken cancellationToken)
    {
        if (!registry.Settings.Enabled) return (null, StatusCode(StatusCodes.Status503ServiceUnavailable));
        if (from > to || to.DayNumber - from.DayNumber > 730)
        {
            return (null, ValidationProblem("The date range must be ordered and no longer than 730 days."));
        }

        if (documentId is null)
        {
            return HasAnalyticsSectionAccess()
                ? (new AnalyticsQuery(connection, from, to, interval), null)
                : (null, Forbid());
        }

        if (!await CanBrowseDocumentAsync(documentId.Value)) return (null, Forbid());
        var routes = await routeService.GetRoutesAsync(documentId.Value, culture, cancellationToken);
        var selectedRoute = routes.FirstOrDefault(route =>
            string.Equals(route.Connection, connection, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(route.Path, path, StringComparison.Ordinal));
        return selectedRoute is null
            ? (null, ValidationProblem("The selected path is not a published route for this document and connection."))
            : (new AnalyticsQuery(connection, from, to, interval, selectedRoute.Path), null);
    }

    private bool HasAnalyticsSectionAccess()
    {
        var security = backOfficeSecurityAccessor.BackOfficeSecurity;
        var user = security?.CurrentUser;
        return user is not null && security!.UserHasSectionAccess(Constants.SectionAlias, user);
    }

    private async Task<bool> CanBrowseDocumentAsync(Guid documentId)
    {
        var user = backOfficeSecurityAccessor.BackOfficeSecurity?.CurrentUser;
        if (user is null) return false;
        var status = await contentPermissionService.AuthorizeAccessAsync(user, documentId, ActionBrowse.ActionLetter);
        return status == ContentAuthorizationStatus.Success;
    }

    private ActionResult VercelProblem(VercelAnalyticsApiException exception)
    {
        var (status, title) = exception.StatusCode switch
        {
            HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden =>
                (StatusCodes.Status502BadGateway, "Vercel rejected the configured credentials or project access."),
            HttpStatusCode.PaymentRequired =>
                (StatusCodes.Status402PaymentRequired, "The report is unavailable for the current Vercel plan."),
            HttpStatusCode.BadRequest =>
                (StatusCodes.Status400BadRequest, "Vercel rejected the analytics query or reporting window."),
            _ => (StatusCodes.Status502BadGateway, "Vercel Analytics is temporarily unavailable.")
        };
        return Problem(statusCode: status, title: title);
    }

    private ActionResult ValidationProblem(string detail) =>
        Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid analytics query.", detail: detail);

    private ActionResult NotFoundProblem(string detail) =>
        Problem(statusCode: StatusCodes.Status404NotFound, title: "Analytics configuration was not found.", detail: detail);

    private static IReadOnlyList<string> ConnectionWarnings(VercelAnalyticsConnection connection)
    {
        var warnings = new List<string>();
        if (!connection.IsConfigured) warnings.Add("No server-side access token is configured for this connection alias.");
        if (!connection.HasMappings) warnings.Add("Global reports only: add a hostname or document root to enable document analytics.");
        return warnings;
    }
}
