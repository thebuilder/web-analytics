using TheBuilder.WebAnalytics.Models;

namespace TheBuilder.WebAnalytics.Services;

// Shared by the Plausible client and the demo mock so both report engagement for the same queries.
internal static class AnalyticsEngagementScope
{
    // Engagement describes visits, so it is left out while a goal filter narrows the report to conversions.
    public static bool IsGoalFiltered(AnalyticsQuery query) =>
        query.EventFilter is not null ||
        query.Filters?.Any(filter => filter.Dimension == AnalyticsDimension.EventName) is true;

    public static bool IsPageScoped(AnalyticsQuery query) =>
        !string.IsNullOrWhiteSpace(query.RequestPath) ||
        query.Filters?.Any(filter => filter.Dimension == AnalyticsDimension.RequestPath) is true;
}
