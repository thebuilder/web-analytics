import { describe, expect, it } from "vitest";
import { analyticsRowHref, filterBreakdownRows, topBreakdownRows, withoutAggregatedOthers } from "./breakdown-rows.js";

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

  it("filters expanded results case-insensitively", () => {
    expect(filterBreakdownRows(rows, "ABOUT").map((row) => row.value)).toEqual(["/about"]);
  });

  it("only creates links for rooted paths on an HTTP origin", () => {
    expect(analyticsRowHref("https://example.com/start", "/news")).toBe("https://example.com/news");
    expect(analyticsRowHref("javascript:alert(1)", "/news")).toBeUndefined();
    expect(analyticsRowHref("https://example.com", "https://attacker.test")).toBeUndefined();
  });
});
