namespace TheBuilder.WebAnalytics.Services;

internal static class AnalyticsRequestPath
{
    public static string Normalize(string path)
    {
        var withoutQuery = path.Split('?', '#')[0];
        var normalized = withoutQuery.StartsWith('/') ? withoutQuery : $"/{withoutQuery}";
        return normalized.Length > 1 ? normalized.TrimEnd('/') : normalized;
    }
}
