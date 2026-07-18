export type MetricComparison = {
  display: string;
  description: string;
  direction: "increase" | "decrease" | "unchanged";
};

export function metricComparison(
  current: number,
  previous: number | null | undefined,
  metric: string,
  periodDays: number,
): MetricComparison | undefined {
  if (previous === null || previous === undefined || previous <= 0) return undefined;

  const percentage = Math.round(((current - previous) / previous) * 100);
  const direction = percentage > 0 ? "increase" : percentage < 0 ? "decrease" : "unchanged";
  const display = percentage > 0 ? `+${percentage}%` : `${percentage}%`;
  const period = periodDays === 1 ? "24 hours" : `${periodDays} days`;
  const description = direction === "unchanged"
    ? `No change in ${metric} compared with the previous ${period}`
    : `${Math.abs(percentage)}% ${direction === "increase" ? "more" : "fewer"} ${metric} than the previous ${period}`;

  return { display, description, direction };
}
