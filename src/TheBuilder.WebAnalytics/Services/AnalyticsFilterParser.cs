using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

public static class AnalyticsFilterParser
{
    public const int MaximumFilters = 10;
    public const int MaximumValueLength = 500;

    public static bool TryParse(
        IReadOnlyList<string>? values,
        out IReadOnlyList<AnalyticsFilter> filters,
        out string? error)
    {
        filters = [];
        error = null;
        if (values is null || values.Count == 0) return true;
        if (values.Count > MaximumFilters)
        {
            error = $"No more than {MaximumFilters} analytics filters are allowed.";
            return false;
        }

        var parsed = new List<AnalyticsFilter>(values.Count);
        var dimensions = new HashSet<AnalyticsDimension>();
        foreach (var item in values)
        {
            var separator = item.IndexOf(':');
            if (separator <= 0 ||
                !Enum.TryParse<AnalyticsDimension>(item[..separator], true, out var dimension) ||
                !Enum.IsDefined(dimension))
            {
                error = "Each analytics filter must contain a supported dimension and value.";
                return false;
            }

            var value = item[(separator + 1)..].Trim();
            if (value.Length is 0 or > MaximumValueLength || value.Any(char.IsControl))
            {
                error = $"Analytics filter values must contain 1 to {MaximumValueLength} non-control characters.";
                return false;
            }

            if (!dimensions.Add(dimension))
            {
                error = "Only one analytics filter per dimension is allowed.";
                return false;
            }

            parsed.Add(new AnalyticsFilter(dimension, value));
        }

        filters = parsed;
        return true;
    }
}
