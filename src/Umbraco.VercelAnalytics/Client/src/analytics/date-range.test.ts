import { describe, expect, it } from "vitest";
import { dateRangeForPreset, formatAnalyticsDate, intervalForRange, normalizeCustomRange } from "./date-range.js";

describe("analytics date ranges", () => {
  it("creates an inclusive 30 day range", () => {
    expect(dateRangeForPreset(30, new Date("2026-07-15T12:00:00Z"))).toEqual({
      from: "2026-06-16",
      to: "2026-07-15",
      interval: "Day",
    });
  });

  it("selects granularity from the reporting window", () => {
    expect(intervalForRange(30)).toBe("Day");
    expect(intervalForRange(31)).toBe("Week");
    expect(intervalForRange(90)).toBe("Week");
    expect(intervalForRange(91)).toBe("Month");
    expect(intervalForRange(365)).toBe("Month");
  });

  it("uses supported granularity for the long presets", () => {
    expect(dateRangeForPreset(90, new Date("2026-07-15T12:00:00Z")).interval).toBe("Week");
    expect(dateRangeForPreset(365, new Date("2026-07-15T12:00:00Z")).interval).toBe("Month");
  });

  it("rejects inverted custom ranges", () => {
    expect(normalizeCustomRange("2026-07-15", "2026-07-14")).toBeUndefined();
  });

  it("formats chart dates compactly like the Vercel dashboard", () => {
    expect(formatAnalyticsDate("2026-07-15T00:00:00Z", "Day", "en-US")).toBe("Jul 15");
    expect(formatAnalyticsDate("2026-07-01T00:00:00Z", "Month", "en-US")).toBe("Jul ’26");
  });
});
