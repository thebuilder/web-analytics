using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Controllers;

public static class AnalyticsApiConventions
{
    [ProducesResponseType<AnalyticsProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<AnalyticsProblemDetails>(StatusCodes.Status402PaymentRequired)]
    [ProducesResponseType<AnalyticsProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<AnalyticsProblemDetails>(StatusCodes.Status502BadGateway)]
    [ProducesResponseType<AnalyticsProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType<AnalyticsProblemDetails>(StatusCodes.Status504GatewayTimeout)]
    public static void Report()
    {
    }
}
