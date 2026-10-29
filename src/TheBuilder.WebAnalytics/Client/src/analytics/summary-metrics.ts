import type { AnalyticsEngagement } from "../api/types.gen.js";
import { formatChartAxisValue } from "./chart-value.js";
import type { DashboardMetric } from "./dashboard-url-state.js";
import { metricComparison, type MetricComparison } from "./metric-comparison.js";

type NumberFormatter = (value: number, options?: Intl.NumberFormatOptions) => string;
type MetricFormat = "count" | "decimal" | "percent" | "duration";
type MetricSource = { visitors: number; pageViews?: number; engagement?: AnalyticsEngagement | null };

export type SummaryMetric = {
  metric: DashboardMetric;
  label: string;
  format: MetricFormat;
  lowerIsBetter?: boolean;
};

export type SummaryComparison = MetricComparison & { tone: "positive" | "negative" | "neutral" };

const SUMMARY_METRICS: ReadonlyArray<SummaryMetric> = [
  { metric: "visitors", label: "Visitors", format: "count" },
  { metric: "pageViews", label: "Page views", format: "count" },
  { metric: "viewsPerVisit", label: "Views per visit", format: "decimal" },
  { metric: "bounceRate", label: "Bounce rate", format: "percent", lowerIsBetter: true },
  { metric: "visitDuration", label: "Visit duration", format: "duration" },
  { metric: "timeOnPage", label: "Time on page", format: "duration" },
  { metric: "scrollDepth", label: "Scroll depth", format: "percent" },
];

const defaultFormatter: NumberFormatter = (value, options) => value.toLocaleString(undefined, options);

export function summaryMetric(metric: DashboardMetric): SummaryMetric {
  return SUMMARY_METRICS.find((definition) => definition.metric === metric) ?? SUMMARY_METRICS[0];
}

export function summaryMetricValue(source: MetricSource | undefined, metric: DashboardMetric): number | undefined {
  if (!source) return undefined;
  if (metric === "visitors") return source.visitors;
  if (metric === "pageViews") return source.pageViews;
  return source.engagement?.[metric] ?? undefined;
}

const BREAKDOWN_ENGAGEMENT: ReadonlyArray<DashboardMetric> = ["bounceRate", "visitDuration", "timeOnPage", "scrollDepth"];

// Expanded breakdowns add a column for each engagement metric that at least one row reports.
export function breakdownEngagementMetrics(rows: ReadonlyArray<MetricSource>): ReadonlyArray<SummaryMetric> {
  return SUMMARY_METRICS.filter(({ metric }) =>
    BREAKDOWN_ENGAGEMENT.includes(metric) && rows.some((row) => summaryMetricValue(row, metric) !== undefined));
}

// Visitors and page views are always shown; engagement metrics appear when the provider reports them.
export function availableSummaryMetrics(totals: MetricSource | undefined): ReadonlyArray<SummaryMetric> {
  return SUMMARY_METRICS.filter(({ metric }) =>
    metric === "visitors" || metric === "pageViews" || summaryMetricValue(totals, metric) !== undefined);
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const remainder = total % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function formatSummaryValue(
  metric: DashboardMetric,
  value: number,
  formatNumber: NumberFormatter = defaultFormatter,
): string {
  switch (summaryMetric(metric).format) {
    case "decimal": return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "percent": return `${formatNumber(Math.round(value))}%`;
    case "duration": return formatDuration(value);
    default: return formatNumber(Math.round(value));
  }
}

export function formatSummaryAxisValue(
  metric: DashboardMetric,
  value: number,
  formatNumber: NumberFormatter = defaultFormatter,
): string {
  switch (summaryMetric(metric).format) {
    case "decimal": return formatNumber(value, { maximumFractionDigits: 1 });
    case "percent": return `${formatNumber(value)}%`;
    case "duration": return formatDuration(value);
    default: return formatChartAxisValue(value, formatNumber);
  }
}

export function summaryComparison(
  metric: DashboardMetric,
  current: number | undefined,
  previous: number | null | undefined,
  periodDays: number,
): SummaryComparison | undefined {
  if (current === undefined) return undefined;
  const definition = summaryMetric(metric);
  const label = definition.label.toLowerCase();
  const comparison = definition.format === "percent"
    ? pointComparison(current, previous, label, periodDays)
    : definition.format === "count"
      ? metricComparison(current, previous, label, periodDays)
      : relativeComparison(current, previous, label, periodDays);
  if (!comparison) return undefined;
  const better = definition.lowerIsBetter ? "decrease" : "increase";
  const tone = comparison.direction === "unchanged"
    ? "neutral"
    : comparison.direction === better ? "positive" : "negative";
  return { ...comparison, tone };
}

function periodLabel(periodDays: number): string {
  return periodDays === 1 ? "24 hours" : `${periodDays} days`;
}

function relativeComparison(
  current: number,
  previous: number | null | undefined,
  label: string,
  periodDays: number,
): MetricComparison | undefined {
  if (previous === null || previous === undefined || previous <= 0) return undefined;
  const percentage = Math.round(((current - previous) / previous) * 100);
  return describe(percentage, `${percentage > 0 ? "+" : ""}${percentage}%`, `${Math.abs(percentage)}%`, label, periodDays);
}

// Rates change in percentage points, matching how Plausible reports bounce rate changes.
function pointComparison(
  current: number,
  previous: number | null | undefined,
  label: string,
  periodDays: number,
): MetricComparison | undefined {
  if (previous === null || previous === undefined) return undefined;
  const points = Math.round(current - previous);
  return describe(points, `${points > 0 ? "+" : ""}${points} pts`, `${Math.abs(points)} percentage ${Math.abs(points) === 1 ? "point" : "points"}`, label, periodDays);
}

function describe(change: number, display: string, amount: string, label: string, periodDays: number): MetricComparison {
  const direction = change > 0 ? "increase" : change < 0 ? "decrease" : "unchanged";
  const period = periodLabel(periodDays);
  const description = direction === "unchanged"
    ? `No change in ${label} compared with the previous ${period}`
    : `${amount} ${direction === "increase" ? "higher" : "lower"} ${label} than the previous ${period}`;
  return { display, description, direction };
}
