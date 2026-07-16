import type { AnalyticsInterval } from "../api/types.gen.js";

export type DatePreset = 7 | 30 | 90 | 365 | "custom";

export type AnalyticsDateRange = {
  from: string;
  to: string;
  interval: AnalyticsInterval;
};

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

export function dateRangeForPreset(
  preset: number,
  today = new Date(),
): AnalyticsDateRange {
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (preset - 1));

  return {
    from: toDateOnly(from),
    to: toDateOnly(to),
    interval: intervalForRange(preset),
  };
}

export function intervalForRange(inclusiveDays: number): AnalyticsInterval {
  if (inclusiveDays <= 30) return "Day";
  if (inclusiveDays <= 90) return "Week";
  return "Month";
}

export function normalizeCustomRange(from: string, to: string): AnalyticsDateRange | undefined {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  if (!from || !to || Number.isNaN(fromDate.valueOf()) || Number.isNaN(toDate.valueOf()) || fromDate > toDate) {
    return undefined;
  }

  const days = Math.floor((toDate.valueOf() - fromDate.valueOf()) / 86_400_000) + 1;
  return { from, to, interval: intervalForRange(days) };
}

export function formatAnalyticsDate(
  timestamp: string,
  interval: AnalyticsInterval,
  locale?: string,
): string {
  const date = new Date(timestamp);
  if (interval === "Month") {
    const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(date);
    return `${month} ’${String(date.getUTCFullYear()).slice(-2)}`;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
