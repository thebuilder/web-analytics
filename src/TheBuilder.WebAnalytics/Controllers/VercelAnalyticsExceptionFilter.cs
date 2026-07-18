using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Controllers;

internal static class VercelAnalyticsProblemCodes
{
    public const string AnalyticsDisabled = "analytics_disabled";
    public const string ConfigurationNotFound = "configuration_not_found";
    public const string InvalidCredentials = "invalid_credentials";
    public const string InvalidQuery = "invalid_query";
    public const string InvalidUpstreamPayload = "invalid_upstream_payload";
    public const string PlanLimit = "plan_limit";
    public const string ReportCapacity = "report_capacity";
    public const string UpstreamTimeout = "upstream_timeout";
    public const string UpstreamTransport = "upstream_transport";
    public const string UpstreamUnavailable = "upstream_unavailable";
}

internal sealed record VercelAnalyticsProblemDefinition(int Status, string Code, string Title);

internal static class VercelAnalyticsProblemFactory
{
    public static ObjectResult CreateResult(VercelAnalyticsProblemDefinition definition, string? detail = null)
    {
        var problem = new AnalyticsProblemDetails
        {
            Status = definition.Status,
            Title = definition.Title,
            Detail = detail,
            Code = definition.Code
        };
        return new ObjectResult(problem) { StatusCode = definition.Status };
    }

    public static ObjectResult CreateResult(int status, string code, string title, string? detail = null) =>
        CreateResult(new VercelAnalyticsProblemDefinition(status, code, title), detail);

    public static VercelAnalyticsProblemDefinition? FromException(Exception exception) => exception switch
    {
        VercelAnalyticsApiException apiException => FromVercelStatus(apiException.StatusCode),
        AnalyticsReportCapacityException => new(
            StatusCodes.Status503ServiceUnavailable,
            VercelAnalyticsProblemCodes.ReportCapacity,
            "The analytics report service is busy. Try again shortly."),
        TaskCanceledException => new(
            StatusCodes.Status504GatewayTimeout,
            VercelAnalyticsProblemCodes.UpstreamTimeout,
            "Vercel Analytics did not respond in time."),
        HttpRequestException => new(
            StatusCodes.Status502BadGateway,
            VercelAnalyticsProblemCodes.UpstreamTransport,
            "Vercel Analytics could not be reached."),
        JsonException => new(
            StatusCodes.Status502BadGateway,
            VercelAnalyticsProblemCodes.InvalidUpstreamPayload,
            "Vercel Analytics returned an invalid response."),
        _ => null
    };

    private static VercelAnalyticsProblemDefinition FromVercelStatus(HttpStatusCode statusCode) => statusCode switch
    {
        HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new(
            StatusCodes.Status502BadGateway,
            VercelAnalyticsProblemCodes.InvalidCredentials,
            "Vercel rejected the configured credentials or project access."),
        HttpStatusCode.PaymentRequired => new(
            StatusCodes.Status402PaymentRequired,
            VercelAnalyticsProblemCodes.PlanLimit,
            "The report is unavailable for the current Vercel plan."),
        HttpStatusCode.BadRequest => new(
            StatusCodes.Status400BadRequest,
            VercelAnalyticsProblemCodes.InvalidQuery,
            "Vercel rejected the analytics query or reporting window."),
        _ => new(
            StatusCodes.Status502BadGateway,
            VercelAnalyticsProblemCodes.UpstreamUnavailable,
            "Vercel Analytics is temporarily unavailable.")
    };
}

public sealed class VercelAnalyticsExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is OperationCanceledException && context.HttpContext.RequestAborted.IsCancellationRequested)
        {
            return;
        }

        var problem = VercelAnalyticsProblemFactory.FromException(context.Exception);
        if (problem is null) return;

        context.Result = VercelAnalyticsProblemFactory.CreateResult(problem);
        context.ExceptionHandled = true;
    }
}
