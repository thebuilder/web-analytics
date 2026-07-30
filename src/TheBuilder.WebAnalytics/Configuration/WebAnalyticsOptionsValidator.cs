using Microsoft.Extensions.Options;
using TheBuilder.WebAnalytics.Providers;

namespace TheBuilder.WebAnalytics.Configuration;

public sealed class WebAnalyticsOptionsValidator : IValidateOptions<WebAnalyticsOptions>
{
    public ValidateOptionsResult Validate(string? name, WebAnalyticsOptions options)
    {
        var settings = WebAnalyticsSettingsMapper.FromServerOptions(options);
        var failures = WebAnalyticsSettingsValidator.Validate(
            settings,
            WebAnalyticsValidationMode.ServerOptions).ToList();
        if (!PlausibleProvider.TryGetApiBaseUrl(options.Providers.Plausible.BaseUrl, out _))
        {
            failures.Add("WebAnalytics:Providers:Plausible:BaseUrl must be an absolute HTTP or HTTPS URL without a query, fragment, or user information.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}
