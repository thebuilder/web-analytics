using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.VercelAnalytics.Configuration;
using Umbraco.VercelAnalytics.Services;

namespace Umbraco.VercelAnalytics.Composers
{
    public class UmbracoVercelAnalyticsApiComposer : IComposer
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
