using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Models;
using Umbraco.VercelAnalytics.Services;

namespace Umbraco.VercelAnalytics.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Umbraco.VercelAnalytics")]
public sealed class UmbracoVercelAnalyticsApiController(
    IAnalyticsAuthorizationService authorizationService,
    VercelAnalyticsConnectionRegistry registry,
    VercelAnalyticsReportService reportService,
    IAnalyticsDocumentRouteService routeService,
    IVercelProjectNameService projectNames) : UmbracoVercelAnalyticsApiControllerBase
{
    private enum ReportScope
    {
        Visits,
        EventList,
        EventSelection
    }

    [HttpGet("connections")]
    [ProducesResponseType<AnalyticsConnectionsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<AnalyticsConnectionsResponse>> Connections(CancellationToken cancellationToken)
    {
        if (!authorizationService.HasAnalyticsSectionAccess()) return Forbid();

        var snapshot = registry.Capture();
        var connectionTasks = snapshot.Settings.Connections
            .Select(settings => snapshot.Get(settings.Key))
            .OfType<VercelAnalyticsConnection>()
            .Select((connection, index) => BuildConnectionSummaryAsync(connection, index == 0, cancellationToken))
            .ToArray();
        var connections = await Task.WhenAll(connectionTasks);

        var response = new AnalyticsConnectionsResponse(
            snapshot.Settings.Enabled,
            snapshot.Settings.DefaultRangeDays,
            connections);
        return Ok(response);

        async Task<AnalyticsConnectionSummary> BuildConnectionSummaryAsync(
            VercelAnalyticsConnection connection,
            bool isDefault,
            CancellationToken token) => new(
                connection.Key,
                await projectNames.GetDisplayNameAsync(connection, token),
                isDefault,
                connection.IsConfigured,
                await routeService.GetConnectionBaseUrlAsync(connection, token),
                ConnectionWarnings(connection));
    }

    [HttpGet("documents/{documentId:guid}/routes")]
    [Authorize(Policy = AuthorizationPolicies.SectionAccessContent)]
    [ProducesResponseType<IReadOnlyList<AnalyticsDocumentRoute>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AnalyticsDocumentRoute>>> DocumentRoutes(
        Guid documentId,
        [FromQuery] string? culture,
        CancellationToken cancellationToken)
    {
        if (!await authorizationService.CanBrowseDocumentAsync(documentId)) return Forbid();
        return Ok(await routeService.GetRoutesAsync(documentId, culture, cancellationToken));
    }

    [HttpGet("reports/summary")]
    [ProducesResponseType<AnalyticsSummary>(StatusCodes.Status200OK)]
    [ApiConventionMethod(typeof(AnalyticsApiConventions), nameof(AnalyticsApiConventions.Report))]
    public async Task<ActionResult<AnalyticsSummary>> Summary(
        [FromQuery] Guid connection,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        [FromQuery] AnalyticsInterval interval,
        [FromQuery] Guid? documentId,
        [FromQuery] string? culture,
        [FromQuery] string? path,
        [FromQuery] string[]? filter,
        CancellationToken cancellationToken)
    {
        var scope = await AuthorizeAndBuildQueryAsync(
            connection, from, to, interval, documentId, culture, path, filter, ReportScope.Visits, cancellationToken);
        if (scope.Error is not null) return scope.Error;
        var report = await reportService.GetSummaryAsync(scope.Query!, cancellationToken);
        return report is null ? NotFoundProblem("The selected analytics connection does not exist.") : Ok(report);
    }

    [HttpGet("reports/breakdown/{dimension}")]
    [ProducesResponseType<AnalyticsBreakdown>(StatusCodes.Status200OK)]
    [ApiConventionMethod(typeof(AnalyticsApiConventions), nameof(AnalyticsApiConventions.Report))]
    public async Task<ActionResult<AnalyticsBreakdown>> Breakdown(
        AnalyticsDimension dimension,
        [FromQuery] Guid connection,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        [FromQuery] AnalyticsInterval interval,
        [FromQuery] int limit = 10,
        [FromQuery] string? search = null,
        [FromQuery] Guid? documentId = null,
        [FromQuery] string? culture = null,
        [FromQuery] string? path = null,
        [FromQuery] string[]? filter = null,
        CancellationToken cancellationToken = default)
    {
        if (!Enum.IsDefined(dimension) || dimension == AnalyticsDimension.EventName)
        {
            return ValidationProblem("The requested breakdown dimension is not supported.");
        }
        if (limit is < 1 or > 100) return ValidationProblem("Limit must be between 1 and 100.");
        if (search?.Length > 200) return ValidationProblem("Search must be 200 characters or fewer.");
        var scope = await AuthorizeAndBuildQueryAsync(
            connection, from, to, interval, documentId, culture, path, filter, ReportScope.Visits, cancellationToken);
        if (scope.Error is not null) return scope.Error;
        var report = await reportService.GetBreakdownAsync(scope.Query!, dimension, limit, search, cancellationToken);
        return report is null ? NotFoundProblem("The selected analytics connection does not exist.") : Ok(report);
    }

    [HttpGet("reports/events")]
    [ProducesResponseType<AnalyticsEventsReport>(StatusCodes.Status200OK)]
    [ApiConventionMethod(typeof(AnalyticsApiConventions), nameof(AnalyticsApiConventions.Report))]
    public async Task<ActionResult<AnalyticsEventsReport>> Events(
        [FromQuery] Guid connection,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        [FromQuery] AnalyticsInterval interval,
        [FromQuery] int limit = 10,
        [FromQuery] string? search = null,
        [FromQuery] Guid? documentId = null,
        [FromQuery] string? culture = null,
        [FromQuery] string? path = null,
        [FromQuery] string[]? filter = null,
        CancellationToken cancellationToken = default)
    {
        if (limit is < 1 or > 100) return ValidationProblem("Limit must be between 1 and 100.");
        if (search?.Length > 200) return ValidationProblem("Search must be 200 characters or fewer.");
        var scope = await AuthorizeAndBuildQueryAsync(
            connection, from, to, interval, documentId, culture, path, filter, ReportScope.EventList, cancellationToken);
        if (scope.Error is not null) return scope.Error;
        var report = await reportService.GetEventsAsync(scope.Query!, limit, search, cancellationToken);
        return report is null ? NotFoundProblem("The selected analytics connection does not exist.") : Ok(report);
    }

    [HttpGet("reports/flags")]
    [ProducesResponseType<AnalyticsFlagsReport>(StatusCodes.Status200OK)]
    [ApiConventionMethod(typeof(AnalyticsApiConventions), nameof(AnalyticsApiConventions.Report))]
    public async Task<ActionResult<AnalyticsFlagsReport>> Flags(
        [FromQuery] Guid connection,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        [FromQuery] AnalyticsInterval interval,
        [FromQuery] string? flagKey = null,
        [FromQuery] int limit = 10,
        [FromQuery] Guid? documentId = null,
        [FromQuery] string? culture = null,
        [FromQuery] string? path = null,
        [FromQuery] string[]? filter = null,
        CancellationToken cancellationToken = default)
    {
        if (flagKey?.Length > 255) return ValidationProblem("Flag key must be 255 characters or fewer.");
        if (limit is < 1 or > 100) return ValidationProblem("Limit must be between 1 and 100.");
        var scope = await AuthorizeAndBuildQueryAsync(
            connection, from, to, interval, documentId, culture, path, filter, ReportScope.Visits, cancellationToken);
        if (scope.Error is not null) return scope.Error;
        var report = await reportService.GetFlagsAsync(scope.Query!, flagKey, limit, cancellationToken);
        return report is null ? NotFoundProblem("The selected analytics connection does not exist.") : Ok(report);
    }

    [HttpGet("reports/events/details")]
    [ProducesResponseType<AnalyticsEventDetails>(StatusCodes.Status200OK)]
    [ApiConventionMethod(typeof(AnalyticsApiConventions), nameof(AnalyticsApiConventions.Report))]
    public async Task<ActionResult<AnalyticsEventDetails>> EventDetails(
        [FromQuery] Guid connection,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        [FromQuery] AnalyticsInterval interval,
        [FromQuery] string eventName,
        [FromQuery] string? eventProperty = null,
        [FromQuery] string? eventValue = null,
        [FromQuery] Guid? documentId = null,
        [FromQuery] string? culture = null,
        [FromQuery] string? path = null,
        [FromQuery] string[]? filter = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(eventName) || eventName.Length > 255)
        {
            return ValidationProblem("Event name is required and must be 255 characters or fewer.");
        }
        if (string.IsNullOrWhiteSpace(eventProperty) != string.IsNullOrWhiteSpace(eventValue))
        {
            return ValidationProblem("Event property and value must be supplied together.");
        }
        if (eventProperty?.Length > 255 || eventValue?.Length > 500)
        {
            return ValidationProblem("Event property must be 255 characters or fewer and value must be 500 characters or fewer.");
        }

        var scope = await AuthorizeAndBuildQueryAsync(
            connection, from, to, interval, documentId, culture, path, filter, ReportScope.EventSelection, cancellationToken);
        if (scope.Error is not null) return scope.Error;
        var eventDataFilter = string.IsNullOrWhiteSpace(eventProperty)
            ? null
            : new AnalyticsEventDataFilter(eventProperty, eventValue!);
        var report = await reportService.GetEventDetailsAsync(scope.Query!, eventName, eventDataFilter, cancellationToken);
        return report is null ? NotFoundProblem("The selected analytics connection does not exist.") : Ok(report);
    }

    [HttpGet("reports/events/property-values")]
    [ProducesResponseType<AnalyticsEventProperty>(StatusCodes.Status200OK)]
    [ApiConventionMethod(typeof(AnalyticsApiConventions), nameof(AnalyticsApiConventions.Report))]
    public async Task<ActionResult<AnalyticsEventProperty>> EventPropertyValues(
        [FromQuery] Guid connection,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        [FromQuery] AnalyticsInterval interval,
        [FromQuery] string eventName,
        [FromQuery] string propertyName,
        [FromQuery] int limit = 100,
        [FromQuery] string? search = null,
        [FromQuery] string? eventProperty = null,
        [FromQuery] string? eventValue = null,
        [FromQuery] Guid? documentId = null,
        [FromQuery] string? culture = null,
        [FromQuery] string? path = null,
        [FromQuery] string[]? filter = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(eventName) || eventName.Length > 255)
        {
            return ValidationProblem("Event name is required and must be 255 characters or fewer.");
        }
        if (string.IsNullOrWhiteSpace(propertyName) || propertyName.Length > 255)
        {
            return ValidationProblem("Event property name is required and must be 255 characters or fewer.");
        }
        if (limit is < 1 or > 100) return ValidationProblem("Limit must be between 1 and 100.");
        if (search?.Length > 200) return ValidationProblem("Search must be 200 characters or fewer.");
        if (string.IsNullOrWhiteSpace(eventProperty) != string.IsNullOrWhiteSpace(eventValue))
        {
            return ValidationProblem("Event property and value must be supplied together.");
        }
        if (eventProperty?.Length > 255 || eventValue?.Length > 500)
        {
            return ValidationProblem("Event property must be 255 characters or fewer and value must be 500 characters or fewer.");
        }

        var scope = await AuthorizeAndBuildQueryAsync(
            connection, from, to, interval, documentId, culture, path, filter, ReportScope.EventSelection, cancellationToken);
        if (scope.Error is not null) return scope.Error;
        var eventDataFilter = string.IsNullOrWhiteSpace(eventProperty)
            ? null
            : new AnalyticsEventDataFilter(eventProperty, eventValue!);
        var report = await reportService.GetEventPropertyValuesAsync(
            scope.Query!,
            eventName,
            propertyName,
            limit,
            search,
            eventDataFilter,
            cancellationToken);
        return report is null ? NotFoundProblem("The selected analytics connection does not exist.") : Ok(report);
    }

    private async Task<(AnalyticsQuery? Query, ActionResult? Error)> AuthorizeAndBuildQueryAsync(
        Guid connection,
        DateTimeOffset from,
        DateTimeOffset to,
        AnalyticsInterval interval,
        Guid? documentId,
        string? culture,
        string? path,
        IReadOnlyList<string>? filterValues,
        ReportScope reportScope,
        CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(interval))
        {
            return (null, ValidationProblem("The requested analytics interval is not supported."));
        }
        if (from >= to || to - from > TimeSpan.FromDays(730))
        {
            return (null, ValidationProblem("The date range must be ordered and no longer than 730 days."));
        }
        if (!AnalyticsFilterParser.TryParse(filterValues, out var filters, out var filterError))
        {
            return (null, ValidationProblem(filterError!));
        }
        if (filters.Any(filter => filter.Dimension == AnalyticsDimension.EventName) &&
            reportScope != ReportScope.EventList)
        {
            return (null, ValidationProblem("EventName filters are only supported by the event list report."));
        }
        if (!registry.Settings.Enabled)
        {
            return (null, VercelAnalyticsProblemFactory.CreateResult(
                StatusCodes.Status503ServiceUnavailable,
                VercelAnalyticsProblemCodes.AnalyticsDisabled,
                "Vercel Analytics is disabled."));
        }

        if (documentId is null)
        {
            return authorizationService.HasAnalyticsSectionAccess()
                ? (new AnalyticsQuery(connection, from, to, interval, Filters: filters), null)
                : (null, Forbid());
        }

        if (!authorizationService.HasContentSectionAccess() ||
            !await authorizationService.CanBrowseDocumentAsync(documentId.Value))
        {
            return (null, Forbid());
        }
        var routes = await routeService.GetRoutesAsync(documentId.Value, culture, cancellationToken);
        var selectedRoute = routes.FirstOrDefault(route =>
            route.Connection == connection &&
            string.Equals(route.Path, path, StringComparison.Ordinal));
        return selectedRoute is null
            ? (null, ValidationProblem("The selected path is not a published route for this document and connection."))
            : (new AnalyticsQuery(connection, from, to, interval, selectedRoute.Path, filters), null);
    }

    private ActionResult ValidationProblem(string detail) =>
        VercelAnalyticsProblemFactory.CreateResult(
            StatusCodes.Status400BadRequest,
            VercelAnalyticsProblemCodes.InvalidQuery,
            "Invalid analytics query.",
            detail);

    private ActionResult NotFoundProblem(string detail) =>
        VercelAnalyticsProblemFactory.CreateResult(
            StatusCodes.Status404NotFound,
            VercelAnalyticsProblemCodes.ConfigurationNotFound,
            "Analytics configuration was not found.",
            detail);

    private static IReadOnlyList<string> ConnectionWarnings(VercelAnalyticsConnection connection)
    {
        var warnings = new List<string>();
        if (!connection.IsConfigured) warnings.Add("No server-side access token is configured for this connection.");
        if (!connection.HasMappings) warnings.Add("Global reports only: add a document root to enable document analytics.");
        return warnings;
    }
}
