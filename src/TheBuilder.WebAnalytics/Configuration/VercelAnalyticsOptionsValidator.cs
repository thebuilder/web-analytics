using Microsoft.Extensions.Options;

namespace TheBuilder.WebAnalytics.Configuration;

public sealed class VercelAnalyticsOptionsValidator : IValidateOptions<VercelAnalyticsOptions>
{
    public ValidateOptionsResult Validate(string? name, VercelAnalyticsOptions options)
    {
        var settings = VercelAnalyticsSettingsMapper.FromServerOptions(options);
        var failures = VercelAnalyticsSettingsValidator.Validate(
            settings,
            VercelAnalyticsValidationMode.ServerOptions);

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}
