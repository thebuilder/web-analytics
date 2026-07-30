using Microsoft.AspNetCore.Mvc;
using TheBuilder.WebAnalytics.Models;
using TheBuilder.WebAnalytics.Services;

namespace TheBuilder.WebAnalytics.Controllers;

public sealed class AnalyticsReportFilters
{
    [FromQuery(Name = "filter")]
    public string[]? Filter { get; init; }

    [FromQuery(Name = "filterFlagKey")]
    public string? FilterFlagKey { get; init; }

    [FromQuery(Name = "filterFlagValue")]
    public string? FilterFlagValue { get; init; }

    [FromQuery(Name = "filterEventName")]
    public string? FilterEventName { get; init; }

    [FromQuery(Name = "filterEventProperty")]
    public string? FilterEventProperty { get; init; }

    [FromQuery(Name = "filterEventValue")]
    public string? FilterEventValue { get; init; }

    internal bool TryParse(out ParsedAnalyticsReportFilters parsed, out string? error)
    {
        parsed = new([], null, null);
        if (!AnalyticsFilterParser.TryParse(Filter, out var filters, out error)) return false;

        var hasFlagKey = !string.IsNullOrWhiteSpace(FilterFlagKey);
        if (hasFlagKey != (FilterFlagValue is not null))
        {
            error = "Flag filter key and value must be supplied together.";
            return false;
        }
        if (FilterFlagKey?.Length > 255 || FilterFlagValue?.Length > 500)
        {
            error = "Flag filter key must be 255 characters or fewer and value must be 500 characters or fewer.";
            return false;
        }

        var hasEventName = !string.IsNullOrWhiteSpace(FilterEventName);
        var hasEventProperty = !string.IsNullOrWhiteSpace(FilterEventProperty);
        var hasEventValue = FilterEventValue is not null;
        if (hasEventName != hasEventProperty || hasEventName != hasEventValue)
        {
            error = "Event filter name, property, and value must be supplied together.";
            return false;
        }
        if (FilterEventName?.Length > 255 || FilterEventProperty?.Length > 255 || FilterEventValue?.Length > 500)
        {
            error = "Event filter name and property must be 255 characters or fewer and value must be 500 characters or fewer.";
            return false;
        }

        parsed = new(
            filters,
            hasFlagKey ? new AnalyticsFlagFilter(FilterFlagKey!.Trim(), FilterFlagValue!) : null,
            hasEventName ? new AnalyticsEventFilter(FilterEventName!.Trim(), FilterEventProperty!.Trim(), FilterEventValue!) : null);
        error = null;
        return true;
    }
}

internal sealed record ParsedAnalyticsReportFilters(
    IReadOnlyList<AnalyticsFilter> Filters,
    AnalyticsFlagFilter? FlagFilter,
    AnalyticsEventFilter? EventFilter);
