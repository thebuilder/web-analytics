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
                .AddOptions<VercelAnalyticsOptions>()
                .Bind(builder.Config.GetSection(VercelAnalyticsOptions.SectionName))
                .ValidateOnStart();
            builder.Services.AddSingleton<IValidateOptions<VercelAnalyticsOptions>, VercelAnalyticsOptionsValidator>();
            builder.Services.AddSingleton<VercelAnalyticsSettingsStore>();
            builder.Services.AddSingleton<VercelAnalyticsConnectionRegistry>();
            builder.Services.AddMemoryCache();
            builder.Services.AddSingleton<AnalyticsReportCache>();
            builder.Services.AddSingleton<VercelAnalyticsRequestGate>();
            builder.Services.AddHttpClient<VercelAnalyticsClient>(client =>
            {
                client.BaseAddress = new Uri("https://api.vercel.com/");
                client.Timeout = TimeSpan.FromSeconds(15);
            });
            builder.Services.AddSingleton<MockVercelAnalyticsClient>();
            builder.Services.AddTransient<IVercelAnalyticsClient, VercelAnalyticsClientRouter>();
            builder.Services.AddTransient<VercelAnalyticsReportService>();
            builder.Services.AddTransient<IVercelProjectNameService, VercelProjectNameService>();
            builder.Services.AddTransient<IAnalyticsAuthorizationService, AnalyticsAuthorizationService>();
            builder.Services.AddTransient<IAnalyticsPublishedContentAccessor, UmbracoAnalyticsPublishedContentAccessor>();
            builder.Services.AddTransient<IAnalyticsDocumentRouteService, AnalyticsDocumentRouteService>();
            builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, AnalyticsSectionAccessInitializer>();
        }
    }
}
