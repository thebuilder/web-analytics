using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Common.Attributes;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Cms.Web.Common.Routing;

namespace TheBuilder.WebAnalytics.Controllers
{
    [ApiController]
    [BackOfficeRoute("management/api/v{version:apiVersion}/vercel-analytics")]
    [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
    [TypeFilter(typeof(VercelAnalyticsExceptionFilter))]
    [MapToApi(Constants.ApiName)]
    public class WebAnalyticsApiControllerBase : ControllerBase
    {
    }
}
