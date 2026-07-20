using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using TheBuilder.WebAnalytics.Configuration;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Composers
{
    public class WebAnalyticsApiComposer : IComposer
    {
        public void Compose(IUmbracoBuilder builder)
        {
            builder.Services
                .AddOptions<WebAnalyticsOptions>()
                .Bind(builder.Config.GetSection(WebAnalyticsOptions.SectionName))
                .ValidateOnStart();
            builder.Services.AddSingleton<IValidateOptions<WebAnalyticsOptions>, WebAnalyticsOptionsValidator>();
            builder.Services.AddSingleton<WebAnalyticsSettingsStore>();
            builder.Services.AddSingleton(AnalyticsProviderCatalog.Default);
            builder.Services.AddSingleton<AnalyticsConnectionRegistry>();
            builder.Services.AddMemoryCache();
            builder.Services.AddSingleton<AnalyticsReportCache>();
            builder.Services.AddSingleton<AnalyticsProviderRequestGate>();
            builder.Services.AddHttpClient<VercelAnalyticsClient>(client =>
            {
                client.BaseAddress = new Uri("https://api.vercel.com/");
                client.Timeout = TimeSpan.FromSeconds(15);
            });
            builder.Services.AddHttpClient<PlausibleAnalyticsClient>(client =>
            {
                client.BaseAddress = new Uri("https://plausible.io/");
                client.Timeout = TimeSpan.FromSeconds(15);
            });
            builder.Services.AddSingleton<MockAnalyticsClient>();
            builder.Services.AddTransient<IAnalyticsProviderClientResolver, AnalyticsProviderClientResolver>();
            builder.Services.AddTransient<AnalyticsReportService>();
            builder.Services.AddTransient<IAnalyticsConnectionNameService, AnalyticsConnectionNameService>();
            builder.Services.AddTransient<IAnalyticsAuthorizationService, AnalyticsAuthorizationService>();
            builder.Services.AddTransient<IAnalyticsPublishedContentAccessor, UmbracoAnalyticsPublishedContentAccessor>();
            builder.Services.AddTransient<IAnalyticsDocumentRouteService, AnalyticsDocumentRouteService>();
            builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, AnalyticsSectionAccessInitializer>();
        }
    }
}
