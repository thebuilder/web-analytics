import type { AnalyticsInterval } from "../api/types.gen.js";

export type DatePreset = 1 | 7 | 30 | 90 | 365 | "custom";

export type AnalyticsDateRange = {
  from: string;
  to: string;
  interval: AnalyticsInterval;
  timeZone: string;
};

export type AnalyticsCalendarDay = {
  date: string;
  day: number;
  outsideMonth: boolean;
  today: boolean;
};

const DAY_MS = 86_400_000;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const toUtcDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

export function dateRangeForPreset(
  preset: number,
  now = new Date(),
  timeZone = browserTimeZone(),
): AnalyticsDateRange {
  const to = new Date(now);
  const from = new Date(to.valueOf() - preset * DAY_MS);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    interval: intervalForRange(preset),
    timeZone,
  };
}

export function intervalForRange(days: number): AnalyticsInterval {
  if (days <= 7) return "Hour";
  if (days <= 90) return "Day";
  if (days <= 365) return "Week";
  return "Month";
}

export function inclusiveRangeDays(range: Pick<AnalyticsDateRange, "from" | "to">): number {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  return Math.max(1, Math.ceil((to - from) / DAY_MS));
}

export function normalizeCustomRange(
  from: string,
  to: string,
  timeZone = browserTimeZone(),
): AnalyticsDateRange | undefined {
  const fromInstant = dateOnlyPattern.test(from) ? zonedMidnightToIso(from, timeZone) : validIso(from);
  const toInstant = dateOnlyPattern.test(to) ? zonedMidnightToIso(to, timeZone) : validIso(to);
  if (!fromInstant || !toInstant || Date.parse(fromInstant) >= Date.parse(toInstant)) return undefined;

  const days = Math.max(1, Math.ceil((Date.parse(toInstant) - Date.parse(fromInstant)) / DAY_MS));
  return { from: fromInstant, to: toInstant, interval: intervalForRange(days), timeZone };
}

export function analyticsDateOnly(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function calendarMonthDays(
  month: string,
  today = new Date(),
): AnalyticsCalendarDay[] {
  const viewDate = new Date(`${month}T00:00:00Z`);
  if (Number.isNaN(viewDate.valueOf())) return [];

  const firstOfMonth = new Date(Date.UTC(viewDate.getUTCFullYear(), viewDate.getUTCMonth(), 1));
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const firstVisibleDay = new Date(firstOfMonth);
  firstVisibleDay.setUTCDate(firstVisibleDay.getUTCDate() - mondayOffset);
  const todayValue = toUtcDateOnly(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisibleDay);
    date.setUTCDate(firstVisibleDay.getUTCDate() + index);
    const value = toUtcDateOnly(date);
    return {
      date: value,
      day: date.getUTCDate(),
      outsideMonth: date.getUTCMonth() !== firstOfMonth.getUTCMonth(),
      today: value === todayValue,
    };
  });
}

export function shiftCalendarMonth(month: string, offset: number): string {
  const date = new Date(`${month}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return month;
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return toUtcDateOnly(date);
}

export function formatAnalyticsRangeLabel(
  range: Pick<AnalyticsDateRange, "from" | "to" | "timeZone">,
  preset: DatePreset,
  locale?: string,
): string {
  if (preset === 1) return "Last 24 hours";
  if (preset !== "custom") return `Last ${preset === 365 ? "12 months" : `${preset} days`}`;
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf())) return "Custom range";

  const fromDate = analyticsDateOnly(range.from, range.timeZone);
  const toDate = analyticsDateOnly(range.to, range.timeZone);
  const sameYear = fromDate.slice(0, 4) === toDate.slice(0, 4);
  const sameMonth = sameYear && fromDate.slice(0, 7) === toDate.slice(0, 7);
  const monthDay = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: range.timeZone });
  const monthDayYear = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: range.timeZone });
  if (sameMonth) {
    const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: range.timeZone }).format(from);
    return `${month} ${Number(fromDate.slice(8))} – ${Number(toDate.slice(8))}`;
  }
  if (sameYear) return `${monthDay.format(from)} – ${monthDay.format(to)}`;
  return `${monthDayYear.format(from)} – ${monthDayYear.format(to)}`;
}

export function formatAnalyticsDate(
  timestamp: string,
  interval: AnalyticsInterval,
  locale?: string,
  timeZone = browserTimeZone(),
): string {
  const date = new Date(timestamp);
  if (interval === "Month") {
    const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone }).format(date);
    const year = new Intl.DateTimeFormat("en", { year: "2-digit", timeZone }).format(date);
    return `${month} ’${year}`;
  }
  if (interval === "Hour") {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone }).format(date);
}

export function formatAnalyticsTooltipDate(
  timestamp: string,
  interval: AnalyticsInterval,
  locale?: string,
  timeZone = browserTimeZone(),
): string {
  const date = new Date(timestamp);
  if (interval === "Hour") {
    return new Intl.DateTimeFormat(locale, {
      month: "short", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", timeZone,
    }).format(date);
  }
  const label = formatAnalyticsDate(timestamp, interval, locale, timeZone);
  if (interval !== "Day") return label;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(date);
  return `${label} · ${weekday}`;
}

export function isAnalyticsPeriodInProgress(
  timestamp: string,
  interval: AnalyticsInterval,
  now = new Date(),
): boolean {
  const start = new Date(timestamp);
  if (Number.isNaN(start.valueOf())) return false;
  const end = new Date(start);
  if (interval === "Month") end.setUTCMonth(end.getUTCMonth() + 1);
  else if (interval === "Week") end.setUTCDate(end.getUTCDate() + 7);
  else if (interval === "Day") end.setUTCDate(end.getUTCDate() + 1);
  else end.setUTCHours(end.getUTCHours() + 1);
  return start <= now && now < end;
}

function validIso(value: string): string | undefined {
  const date = new Date(value);
  return value && !Number.isNaN(date.valueOf()) ? date.toISOString() : undefined;
}

function zonedMidnightToIso(dateOnly: string, timeZone: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return undefined;
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt++) {
    const offset = timeZoneOffsetMilliseconds(new Date(candidate), timeZone);
    const adjusted = desired - offset;
    if (adjusted === candidate) break;
    candidate = adjusted;
  }
  const result = new Date(candidate);
  return analyticsDateOnly(result.toISOString(), timeZone) === dateOnly ? result.toISOString() : undefined;
}

function timeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallClockAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return wallClockAsUtc - Math.floor(date.valueOf() / 1000) * 1000;
}
