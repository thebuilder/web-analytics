import { describe, expect, it } from "vitest";
import { calendarMonthDays, dateRangeForPreset, formatAnalyticsDate, formatAnalyticsRangeLabel, formatAnalyticsTooltipDate, inclusiveRangeDays, intervalForRange, isAnalyticsPeriodInProgress, normalizeCustomRange, shiftCalendarMonth } from "./date-range.js";

describe("analytics date ranges", () => {
  it("creates an exact rolling 30 day range", () => {
    expect(dateRangeForPreset(30, new Date("2026-07-15T12:00:00Z"), "UTC")).toEqual({
      from: "2026-06-15T12:00:00.000Z",
      to: "2026-07-15T12:00:00.000Z",
      interval: "Day",
      timeZone: "UTC",
    });
  });

  it("creates an hourly rolling 24 hour range", () => {
    expect(dateRangeForPreset(1, new Date("2026-07-15T12:00:00Z"), "Europe/Copenhagen")).toEqual({
      from: "2026-07-14T12:00:00.000Z",
      to: "2026-07-15T12:00:00.000Z",
      interval: "Hour",
      timeZone: "Europe/Copenhagen",
    });
  });

  it("selects granularity from the reporting window", () => {
    expect(intervalForRange(7)).toBe("Hour");
    expect(intervalForRange(30)).toBe("Day");
    expect(intervalForRange(90)).toBe("Day");
    expect(intervalForRange(91)).toBe("Week");
    expect(intervalForRange(365)).toBe("Week");
    expect(intervalForRange(366)).toBe("Month");
  });

  it("uses supported granularity for the long presets", () => {
    expect(dateRangeForPreset(90, new Date("2026-07-15T12:00:00Z")).interval).toBe("Day");
    expect(dateRangeForPreset(365, new Date("2026-07-15T12:00:00Z")).interval).toBe("Week");
  });

  it("rejects inverted custom ranges", () => {
    expect(normalizeCustomRange("2026-07-15", "2026-07-14", "UTC")).toBeUndefined();
  });

  it("counts both ends of a reporting range", () => {
    expect(inclusiveRangeDays({ from: "2026-06-15T12:00:00Z", to: "2026-07-15T12:00:00Z" })).toBe(30);
  });

  it("builds a six-week Monday-first calendar month", () => {
    const days = calendarMonthDays("2026-07-16", new Date("2026-07-16T12:00:00Z"));

    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ date: "2026-06-29", outsideMonth: true });
    expect(days[3]).toMatchObject({ date: "2026-07-02", outsideMonth: false });
    expect(days[17]).toMatchObject({ date: "2026-07-16", today: true });
    expect(days[41].date).toBe("2026-08-09");
  });

  it("moves between calendar months without carrying the day", () => {
    expect(shiftCalendarMonth("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftCalendarMonth("2026-01-31", -1)).toBe("2025-12-01");
  });

  it("formats preset and custom range labels compactly", () => {
    expect(formatAnalyticsRangeLabel({ from: "2026-07-14T12:00:00Z", to: "2026-07-15T12:00:00Z", timeZone: "UTC" }, 1, "en-US")).toBe("Last 24 hours");
    expect(formatAnalyticsRangeLabel({ from: "2026-06-17T00:00:00Z", to: "2026-07-16T00:00:00Z", timeZone: "UTC" }, 30, "en-US")).toBe("Last 30 days");
    expect(formatAnalyticsRangeLabel({ from: "2026-07-09T00:00:00Z", to: "2026-07-16T00:00:00Z", timeZone: "UTC" }, "custom", "en-US")).toBe("Jul 9 – 16");
    expect(formatAnalyticsRangeLabel({ from: "2026-06-17T00:00:00Z", to: "2026-07-16T00:00:00Z", timeZone: "UTC" }, "custom", "en-US")).toBe("Jun 17 – Jul 16");
  });

  it("formats chart dates compactly like the Vercel dashboard", () => {
    expect(formatAnalyticsDate("2026-07-15T00:00:00Z", "Day", "en-US")).toBe("Jul 15");
    expect(formatAnalyticsDate("2026-07-15T14:00:00Z", "Hour", "en-US", "Europe/Copenhagen")).toBe("4:00 PM");
    expect(formatAnalyticsDate("2026-07-15T14:00:00Z", "Hour", "da-DK", "Europe/Copenhagen")).toBe("16.00");
    expect(formatAnalyticsDate("2026-07-01T00:00:00Z", "Month", "en-US")).toBe("Jul ’26");
    expect(formatAnalyticsTooltipDate("2026-07-14T00:00:00Z", "Day", "en-US")).toBe("Jul 14 · Tue");
    expect(formatAnalyticsTooltipDate("2026-07-15T14:00:00Z", "Hour", "da-DK", "Europe/Copenhagen")).toContain("16.00");
    expect(formatAnalyticsTooltipDate("2026-07-01T00:00:00Z", "Month", "en-US")).toBe("Jul ’26");
  });

  it("identifies the current aggregate bucket as incomplete", () => {
    const now = new Date("2026-07-16T10:30:00Z");

    expect(isAnalyticsPeriodInProgress("2026-07-16T00:00:00Z", "Day", now)).toBe(true);
    expect(isAnalyticsPeriodInProgress("2026-07-16T10:00:00Z", "Hour", now)).toBe(true);
    expect(isAnalyticsPeriodInProgress("2026-07-10T00:00:00Z", "Week", now)).toBe(true);
    expect(isAnalyticsPeriodInProgress("2026-07-01T00:00:00Z", "Month", now)).toBe(true);
    expect(isAnalyticsPeriodInProgress("2026-07-15T00:00:00Z", "Day", now)).toBe(false);
  });
});
