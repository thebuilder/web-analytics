#if UMBRACO_18_OR_LATER
using Microsoft.AspNetCore.Mvc.Controllers;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
#else
using Asp.Versioning;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
#endif
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using TheBuilder.WebAnalytics;

namespace TheBuilder.WebAnalytics.Example;

public sealed class VercelAnalyticsOpenApiComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
#if UMBRACO_18_OR_LATER
        builder.AddBackOfficeOpenApiDocument(
            Constants.ApiName,
            document => document
                .WithTitle("Web Analytics Backoffice API")
                .WithBackOfficeAuthentication()
                .ConfigureOpenApiOptions(options => options.AddOperationTransformer(
                    (operation, context, _) =>
                    {
                        if (context.Description.ActionDescriptor is ControllerActionDescriptor controller &&
                            controller.ControllerTypeInfo.Namespace?.StartsWith(
                                "TheBuilder.WebAnalytics.Controllers",
                                StringComparison.InvariantCultureIgnoreCase) is true)
                        {
                            operation.OperationId = context.Description.ActionDescriptor.RouteValues["action"];
                        }

                        return Task.CompletedTask;
                    })));
#else
        builder.Services.AddSingleton<IOperationIdHandler, VercelAnalyticsOperationIdHandler>();
        builder.Services.Configure<SwaggerGenOptions>(options =>
        {
            options.SwaggerDoc(
                Constants.ApiName,
                new OpenApiInfo
                {
                    Title = "Web Analytics Backoffice API",
                    Version = "1.0",
                });
            options.OperationFilter<VercelAnalyticsOperationSecurityFilter>();
        });
#endif
    }

#if !UMBRACO_18_OR_LATER
    private sealed class VercelAnalyticsOperationSecurityFilter : BackOfficeSecurityRequirementsOperationFilterBase
    {
        protected override string ApiName => Constants.ApiName;
    }

    private sealed class VercelAnalyticsOperationIdHandler(IOptions<ApiVersioningOptions> apiVersioningOptions)
        : OperationIdHandler(apiVersioningOptions)
    {
        protected override bool CanHandle(
            ApiDescription apiDescription,
            ControllerActionDescriptor controllerActionDescriptor)
            => controllerActionDescriptor.ControllerTypeInfo.Namespace?.StartsWith(
                "TheBuilder.WebAnalytics.Controllers",
                StringComparison.InvariantCultureIgnoreCase) is true;

        public override string Handle(ApiDescription apiDescription)
            => $"{apiDescription.ActionDescriptor.RouteValues["action"]}";
    }
#endif
}
