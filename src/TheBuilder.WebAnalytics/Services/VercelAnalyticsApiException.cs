using System.Net;

namespace TheBuilder.WebAnalytics.Services;

public sealed class VercelAnalyticsApiException(HttpStatusCode statusCode)
    : Exception($"Vercel Analytics returned HTTP {(int)statusCode}.")
{
    public HttpStatusCode StatusCode { get; } = statusCode;
}
