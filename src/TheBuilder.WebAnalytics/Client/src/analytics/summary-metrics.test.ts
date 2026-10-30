import { describe, expect, it } from "vitest";
import {
  availableSummaryMetrics,
  formatDuration,
  formatSummaryAxisValue,
  formatSummaryValue,
  summaryComparison,
} from "./summary-metrics.js";

describe("summary metrics", () => {
  it("keeps visitors and page views and adds only the engagement a provider reports", () => {
    expect(availableSummaryMetrics({ visitors: 1, pageViews: 2 }).map(({ metric }) => metric))
      .toEqual(["visitors", "pageViews"]);
    expect(availableSummaryMetrics({
      visitors: 1,
      pageViews: 2,
      engagement: { bounceRate: 41, timeOnPage: 74, scrollDepth: null },
    }).map(({ metric }) => metric)).toEqual(["visitors", "pageViews", "bounceRate", "timeOnPage"]);
  });

  it("formats durations the way editors read them", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(134)).toBe("2m 14s");
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(3_780)).toBe("1h 3m");
  });

  it("formats each metric with its own unit", () => {
    expect(formatSummaryValue("pageViews", 1_234.4)).toBe((1_234).toLocaleString());
    expect(formatSummaryValue("viewsPerVisit", 1.5)).toBe((1.5).toLocaleString(undefined, { minimumFractionDigits: 2 }));
    expect(formatSummaryValue("bounceRate", 41.6)).toBe("42%");
    expect(formatSummaryValue("visitDuration", 162)).toBe("2m 42s");
    expect(formatSummaryAxisValue("timeOnPage", 90)).toBe("1m 30s");
    expect(formatSummaryAxisValue("scrollDepth", 40)).toBe("40%");
  });

  it("treats a lower bounce rate as an improvement and compares rates in points", () => {
    expect(summaryComparison("bounceRate", 38, 41, 30)).toEqual({
      display: "-3 pts",
      description: "3 percentage points lower bounce rate than the previous 30 days",
      direction: "decrease",
      tone: "positive",
    });
    expect(summaryComparison("bounceRate", 44, 41, 7)?.tone).toBe("negative");
  });

  it("compares durations relative to the previous period", () => {
    expect(summaryComparison("visitDuration", 110, 100, 1)).toEqual({
      display: "+10%",
      description: "10% higher visit duration than the previous 24 hours",
      direction: "increase",
      tone: "positive",
    });
  });

  it("omits a comparison without a previous value", () => {
    expect(summaryComparison("timeOnPage", 74, undefined, 30)).toBeUndefined();
    expect(summaryComparison("visitDuration", 10, 0, 30)).toBeUndefined();
  });
});
