import { describe, expect, it } from "vitest";
import { calendarMonthDays, dateRangeForPreset, formatAnalyticsDate, formatAnalyticsRangeLabel, formatAnalyticsTooltipDate, inclusiveRangeDays, intervalForRange, isAnalyticsPeriodInProgress, normalizeCustomRange, normalizePresetRange, shiftCalendarMonth } from "./date-range.js";

describe("analytics date ranges", () => {
  it("aligns a multi-day preset to Vercel's rolling hour boundaries", () => {
    expect(dateRangeForPreset(30, new Date("2026-07-15T12:34:56Z"), "UTC")).toEqual({
      from: "2026-06-15T12:00:00.000Z",
      to: "2026-07-15T13:00:00.000Z",
      interval: "Day",
      timeZone: "UTC",
    });
  });

  it("creates Vercel's inclusive Jul 13 through Jul 20 daily window", () => {
    expect(dateRangeForPreset(7, new Date("2026-07-20T15:05:47.886Z"), "Europe/Copenhagen")).toEqual({
      from: "2026-07-13T15:00:00.000Z",
      to: "2026-07-20T16:00:00.000Z",
      interval: "Day",
      timeZone: "Europe/Copenhagen",
    });
  });

  it("aligns presets to the client hour in fractional-offset timezones", () => {
    expect(dateRangeForPreset(7, new Date("2026-07-20T11:20:47.886Z"), "Asia/Kathmandu")).toEqual({
      from: "2026-07-13T11:15:00.000Z",
      to: "2026-07-20T12:15:00.000Z",
      interval: "Day",
      timeZone: "Asia/Kathmandu",
    });
  });

  it("preserves Vercel's rolling instants while using daily granularity", () => {
    expect(normalizePresetRange(
      7,
      "2026-07-06T13:00:00.001Z",
      "2026-07-13T14:00:00.000Z",
      "Europe/Copenhagen",
    )).toEqual({
      from: "2026-07-06T13:00:00.001Z",
      to: "2026-07-13T14:00:00.000Z",
      interval: "Day",
      timeZone: "Europe/Copenhagen",
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
    expect(intervalForRange(1)).toBe("Hour");
    expect(intervalForRange(2)).toBe("Day");
    expect(intervalForRange(7)).toBe("Day");
    expect(intervalForRange(30)).toBe("Day");
    expect(intervalForRange(31)).toBe("Week");
    expect(intervalForRange(90)).toBe("Week");
    expect(intervalForRange(91)).toBe("Month");
    expect(intervalForRange(365)).toBe("Month");
    expect(intervalForRange(366)).toBe("Month");
  });

  it("uses supported granularity for the long presets", () => {
    expect(dateRangeForPreset(90, new Date("2026-07-15T12:00:00Z")).interval).toBe("Week");
    expect(dateRangeForPreset(365, new Date("2026-07-15T12:00:00Z")).interval).toBe("Month");
  });

  it("rejects inverted custom ranges", () => {
    expect(normalizeCustomRange("2026-07-15", "2026-07-14", "UTC")).toBeUndefined();
  });

  it("makes date-only custom ranges inclusive of the selected end day", () => {
    const range = normalizeCustomRange("2026-07-09", "2026-07-16", "UTC");

    expect(range).toMatchObject({
      from: "2026-07-09T00:00:00.000Z",
      to: "2026-07-17T00:00:00.000Z",
      interval: "Day",
      timeZone: "UTC",
    });
    expect(inclusiveRangeDays(range!)).toBe(8);
  });

  it("keeps date-only custom ranges valid when both selected dates are the same", () => {
    const range = normalizeCustomRange("2026-07-16", "2026-07-16", "UTC");

    expect(range).toMatchObject({
      from: "2026-07-16T00:00:00.000Z",
      to: "2026-07-17T00:00:00.000Z",
      interval: "Hour",
    });
    expect(inclusiveRangeDays(range!)).toBe(1);
  });

  it("uses the next local midnight for custom ranges across daylight saving time", () => {
    const range = normalizeCustomRange("2026-03-28", "2026-03-29", "Europe/Copenhagen");

    expect(range).toMatchObject({
      from: "2026-03-27T23:00:00.000Z",
      to: "2026-03-29T22:00:00.000Z",
      interval: "Day",
      timeZone: "Europe/Copenhagen",
    });
    expect(inclusiveRangeDays(range!)).toBe(2);
  });

  it("leaves explicit custom instants unchanged", () => {
    expect(normalizeCustomRange("2026-07-09T00:00:00Z", "2026-07-17T00:00:00Z", "UTC")).toMatchObject({
      from: "2026-07-09T00:00:00.000Z",
      to: "2026-07-17T00:00:00.000Z",
    });
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
    expect(formatAnalyticsRangeLabel({ from: "2026-07-09T00:00:00Z", to: "2026-07-17T00:00:00Z", timeZone: "UTC" }, "custom", "en-US")).toBe("Jul 9 – 16");
    expect(formatAnalyticsRangeLabel({ from: "2026-06-17T00:00:00Z", to: "2026-07-17T00:00:00Z", timeZone: "UTC" }, "custom", "en-US")).toBe("Jun 17 – Jul 16");
  });

  it("does not subtract a day from timestamp-based custom range labels", () => {
    expect(formatAnalyticsRangeLabel({
      from: "2026-07-09T12:00:00Z",
      to: "2026-07-17T12:00:00Z",
      timeZone: "UTC",
    }, "custom", "en-US")).toBe("Jul 9 – 17");
  });

  it("formats chart dates compactly like the Vercel dashboard", () => {
    expect(formatAnalyticsDate("2026-07-15T00:00:00Z", "Day", "en-US")).toBe("Jul 15");
    expect(formatAnalyticsDate("2026-07-15T14:00:00Z", "Hour", "en-US", "Europe/Copenhagen")).toBe("4:00 PM");
    expect(formatAnalyticsDate("2026-07-15T14:00:00Z", "Hour", "da-DK", "Europe/Copenhagen")).toBe("16.00");
    expect(formatAnalyticsDate("2026-06-01T00:00:00Z", "Week", "en-US")).toBe("Jun 1–7");
    expect(formatAnalyticsDate("2026-06-29T00:00:00Z", "Week", "en-US")).toBe("Jun 29–Jul 5");
    expect(formatAnalyticsDate("2026-07-01T00:00:00Z", "Month", "en-US")).toBe("Jul ’26");
    expect(formatAnalyticsTooltipDate("2026-07-14T00:00:00Z", "Day", "en-US")).toBe("Jul 14 · Tue");
    expect(formatAnalyticsTooltipDate("2026-07-15T14:00:00Z", "Hour", "da-DK", "Europe/Copenhagen")).toContain("16.00");
    expect(formatAnalyticsTooltipDate("2026-06-01T00:00:00Z", "Week", "en-US")).toBe("Jun 1–7, 2026");
    expect(formatAnalyticsTooltipDate("2026-12-28T00:00:00Z", "Week", "en-US")).toBe("Dec 28, 2026–Jan 3, 2027");
    expect(formatAnalyticsTooltipDate("2026-07-01T00:00:00Z", "Month", "en-US")).toBe("July 2026");
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
