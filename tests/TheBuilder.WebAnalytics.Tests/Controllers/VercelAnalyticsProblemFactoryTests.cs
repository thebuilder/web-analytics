using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using TheBuilder.WebAnalytics.Controllers;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Tests.Controllers;

public sealed class VercelAnalyticsProblemFactoryTests
{
    [Fact]
    public void Maps_credential_failures_to_stable_problem_code()
    {
        var problem = Assert.IsType<VercelAnalyticsProblemDefinition>(
            VercelAnalyticsProblemFactory.FromException(
                new VercelAnalyticsApiException(HttpStatusCode.Forbidden)));

        Assert.Equal(StatusCodes.Status502BadGateway, problem.Status);
        Assert.Equal(VercelAnalyticsProblemCodes.InvalidCredentials, problem.Code);
    }

    [Theory]
    [InlineData(HttpStatusCode.PaymentRequired, StatusCodes.Status402PaymentRequired, VercelAnalyticsProblemCodes.PlanLimit)]
    [InlineData(HttpStatusCode.BadRequest, StatusCodes.Status400BadRequest, VercelAnalyticsProblemCodes.InvalidQuery)]
    [InlineData(HttpStatusCode.ServiceUnavailable, StatusCodes.Status502BadGateway, VercelAnalyticsProblemCodes.UpstreamUnavailable)]
    public void Maps_vercel_failures_to_stable_problem_codes(
        HttpStatusCode upstreamStatus,
        int expectedStatus,
        string expectedCode)
    {
        var problem = Assert.IsType<VercelAnalyticsProblemDefinition>(
            VercelAnalyticsProblemFactory.FromException(new VercelAnalyticsApiException(upstreamStatus)));

        Assert.Equal(expectedStatus, problem.Status);
        Assert.Equal(expectedCode, problem.Code);
    }

    [Fact]
    public void Maps_transport_timeout_and_payload_failures()
    {
        Assert.Equal(
            VercelAnalyticsProblemCodes.UpstreamTransport,
            VercelAnalyticsProblemFactory.FromException(new HttpRequestException())?.Code);
        Assert.Equal(
            VercelAnalyticsProblemCodes.UpstreamTimeout,
            VercelAnalyticsProblemFactory.FromException(new TaskCanceledException())?.Code);
        Assert.Equal(
            VercelAnalyticsProblemCodes.InvalidUpstreamPayload,
            VercelAnalyticsProblemFactory.FromException(new JsonException())?.Code);
    }

    [Fact]
    public void Maps_report_capacity_failures_to_service_unavailable()
    {
        var problem = Assert.IsType<VercelAnalyticsProblemDefinition>(
            VercelAnalyticsProblemFactory.FromException(new AnalyticsReportCapacityException()));

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, problem.Status);
        Assert.Equal(VercelAnalyticsProblemCodes.ReportCapacity, problem.Code);
    }

    [Fact]
    public void Returns_a_typed_problem_details_contract()
    {
        var result = VercelAnalyticsProblemFactory.CreateResult(
            StatusCodes.Status400BadRequest,
            VercelAnalyticsProblemCodes.InvalidQuery,
            "Invalid analytics query.");

        var details = Assert.IsType<AnalyticsProblemDetails>(result.Value);
        Assert.Equal(VercelAnalyticsProblemCodes.InvalidQuery, details.Code);
    }

    [Fact]
    public void Exception_filter_maps_transport_failures_at_the_controller_boundary()
    {
        var context = CreateExceptionContext(new HttpRequestException());

        new VercelAnalyticsExceptionFilter().OnException(context);

        AssertProblem(context, StatusCodes.Status502BadGateway, VercelAnalyticsProblemCodes.UpstreamTransport);
    }

    [Fact]
    public void Exception_filter_maps_invalid_json_at_the_controller_boundary()
    {
        var context = CreateExceptionContext(new JsonException());

        new VercelAnalyticsExceptionFilter().OnException(context);

        AssertProblem(context, StatusCodes.Status502BadGateway, VercelAnalyticsProblemCodes.InvalidUpstreamPayload);
    }

    private static ExceptionContext CreateExceptionContext(Exception exception)
    {
        var actionContext = new ActionContext(
            new DefaultHttpContext(),
            new RouteData(),
            new ActionDescriptor());
        return new ExceptionContext(actionContext, []) { Exception = exception };
    }

    private static void AssertProblem(ExceptionContext context, int status, string code)
    {
        Assert.True(context.ExceptionHandled);
        var result = Assert.IsType<ObjectResult>(context.Result);
        Assert.Equal(status, result.StatusCode);
        var details = Assert.IsType<AnalyticsProblemDetails>(result.Value);
        Assert.Equal(code, details.Code);
    }
}
