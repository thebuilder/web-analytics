import { describe, expect, it } from "vitest";
import {
  analyticsRowHref,
  breakdownBarRatio,
  breakdownDisplayValue,
  breakdownMetricTotal,
  breakdownPercentage,
  isPercentageDimension,
  referrerExternalHref,
  referrerFaviconUrl,
  topBreakdownRows,
  visibleBreakdownRows,
  withoutAggregatedOthers,
} from "./breakdown-rows.js";

const rows = [
  { value: "/news", visitors: 12, pageViews: 18 },
  { value: "Others", visitors: 9, pageViews: 11 },
  { value: "/about", visitors: 4, pageViews: 6 },
];

describe("analytics breakdown rows", () => {
  it("removes Vercel's aggregate row everywhere", () => {
    expect(withoutAggregatedOthers(rows).map((row) => row.value)).toEqual(["/news", "/about"]);
  });

  it("limits panels after removing the aggregate row", () => {
    expect(topBreakdownRows(rows, 1).map((row) => row.value)).toEqual(["/news"]);
  });

  it("removes blank values but keeps unknown attribution", () => {
    const referrers = [
      { value: "", visitors: 12, pageViews: 18 },
      { value: "Unknown", visitors: 9, pageViews: 11 },
      { value: "google.com", visitors: 4, pageViews: 6 },
    ];

    expect(visibleBreakdownRows(referrers).map((row) => row.value)).toEqual(["Unknown", "google.com"]);
  });

  it("formats percentage dimensions and device labels", () => {
    expect(isPercentageDimension("Country")).toBe(true);
    expect(isPercentageDimension("RequestPath")).toBe(false);
    expect(breakdownPercentage(379_285, 968_832)).toEqual({ display: "39%", precise: "39.15%" });
    expect(breakdownPercentage(2, 1_000)).toEqual({ display: "<1%", precise: "0.2%" });
    expect(breakdownDisplayValue("mobile", "DeviceType")).toBe("Mobile");
    expect(breakdownDisplayValue("Mobile Safari", "BrowserName")).toBe("Mobile Safari");
  });

  it("uses the visible grouped values as the percentage denominator", () => {
    const filteredRows = [
      { value: "Desktop", visitors: 11_259, pageViews: 17_380 },
      { value: "Unknown", visitors: 80, pageViews: 10 },
      { value: "Others", visitors: 36, pageViews: 5 },
    ];

    const visitorTotal = breakdownMetricTotal(filteredRows, "visitors");
    expect(visitorTotal).toBe(11_339);
    expect(breakdownPercentage(filteredRows[0].visitors, visitorTotal)).toEqual({ display: "99%", precise: "99.29%" });
  });

  it("scales bars relative to the largest contributor", () => {
    expect(breakdownBarRatio(86, 86)).toBe(1);
    expect(breakdownBarRatio(7, 86)).toBeCloseTo(0.0814, 4);
    expect(breakdownBarRatio(0, 0)).toBe(0);
  });

  it("builds an encoded Google favicon URL for a referrer hostname", () => {
    expect(referrerFaviconUrl("www.example.com")).toBe("https://www.google.com/s2/favicons?domain=www.example.com&sz=32");
    expect(referrerFaviconUrl("sub domain.example")).toContain("domain=sub%20domain.example");
    expect(referrerFaviconUrl("Unknown")).toBeUndefined();
  });

  it("creates secure external links for attributed referrer hostnames", () => {
    expect(referrerExternalHref("google.com")).toBe("https://google.com/");
    expect(referrerExternalHref("sub.example.com")).toBe("https://sub.example.com/");
    expect(referrerExternalHref("Unknown")).toBeUndefined();
    expect(referrerExternalHref("example.com/path")).toBeUndefined();
    expect(referrerExternalHref("example.com?q=test")).toBeUndefined();
  });

  it("only creates links for rooted paths on an HTTP origin", () => {
    expect(analyticsRowHref("https://example.com/start", "/news")).toBe("https://example.com/news");
    expect(analyticsRowHref("javascript:alert(1)", "/news")).toBeUndefined();
    expect(analyticsRowHref("https://example.com", "https://attacker.test")).toBeUndefined();
  });
});
