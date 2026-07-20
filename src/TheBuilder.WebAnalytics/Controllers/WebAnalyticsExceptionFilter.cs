using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Controllers;

internal static class WebAnalyticsProblemCodes
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

internal sealed record WebAnalyticsProblemDefinition(int Status, string Code, string Title);

internal static class WebAnalyticsProblemFactory
{
    public static ObjectResult CreateResult(WebAnalyticsProblemDefinition definition, string? detail = null)
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
        CreateResult(new WebAnalyticsProblemDefinition(status, code, title), detail);

    public static WebAnalyticsProblemDefinition? FromException(Exception exception) => exception switch
    {
        AnalyticsProviderApiException apiException => FromProviderStatus(apiException.Provider, apiException.StatusCode),
        AnalyticsReportCapacityException => new(
            StatusCodes.Status503ServiceUnavailable,
            WebAnalyticsProblemCodes.ReportCapacity,
            "The analytics report service is busy. Try again shortly."),
        TaskCanceledException => new(
            StatusCodes.Status504GatewayTimeout,
            WebAnalyticsProblemCodes.UpstreamTimeout,
            "The analytics provider did not respond in time."),
        HttpRequestException => new(
            StatusCodes.Status502BadGateway,
            WebAnalyticsProblemCodes.UpstreamTransport,
            "The analytics provider could not be reached."),
        JsonException => new(
            StatusCodes.Status502BadGateway,
            WebAnalyticsProblemCodes.InvalidUpstreamPayload,
            "The analytics provider returned an invalid response."),
        _ => null
    };

    private static WebAnalyticsProblemDefinition FromProviderStatus(AnalyticsProvider provider, HttpStatusCode statusCode)
    {
        var definition = AnalyticsProviderCatalog.Default.Get(provider);
        return statusCode switch
        {
        HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new(
            StatusCodes.Status502BadGateway,
            WebAnalyticsProblemCodes.InvalidCredentials,
            $"{provider} rejected the configured credentials or connection access."),
        HttpStatusCode.PaymentRequired => new(
            StatusCodes.Status402PaymentRequired,
            WebAnalyticsProblemCodes.PlanLimit,
            $"The report is unavailable for the current {provider} plan."),
        _ when definition.IsInvalidQuery(statusCode) => new(
            StatusCodes.Status400BadRequest,
            WebAnalyticsProblemCodes.InvalidQuery,
            $"{provider} rejected the analytics query or reporting window."),
        HttpStatusCode.TooManyRequests => new(
            StatusCodes.Status503ServiceUnavailable,
            WebAnalyticsProblemCodes.UpstreamUnavailable,
            $"{provider} rate-limited the analytics request. Try again shortly."),
        _ => new(
            StatusCodes.Status502BadGateway,
            WebAnalyticsProblemCodes.UpstreamUnavailable,
            $"{provider} Analytics is temporarily unavailable.")
        };
    }
}

public sealed class WebAnalyticsExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is OperationCanceledException && context.HttpContext.RequestAborted.IsCancellationRequested)
        {
            return;
        }

        var problem = WebAnalyticsProblemFactory.FromException(context.Exception);
        if (problem is null) return;

        context.Result = WebAnalyticsProblemFactory.CreateResult(problem);
        context.ExceptionHandled = true;
    }
}
