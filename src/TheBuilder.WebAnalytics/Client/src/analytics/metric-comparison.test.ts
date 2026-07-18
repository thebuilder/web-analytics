import { describe, expect, it } from "vitest";
import { metricComparison } from "./metric-comparison.js";

describe("metricComparison", () => {
  it("describes an increase over the preceding period", () => {
    expect(metricComparison(13_706, 6_958, "visitors", 30)).toEqual({
      display: "+97%",
      description: "97% more visitors than the previous 30 days",
      direction: "increase",
    });
  });

  it("describes a decrease without relying on color", () => {
    expect(metricComparison(71, 100, "page views", 7)).toEqual({
      display: "-29%",
      description: "29% fewer page views than the previous 7 days",
      direction: "decrease",
    });
  });

  it("describes a rolling one-day comparison as 24 hours", () => {
    expect(metricComparison(120, 100, "visitors", 1)?.description).toBe(
      "20% more visitors than the previous 24 hours",
    );
  });

  it("omits a percentage when no finite baseline exists", () => {
    expect(metricComparison(10, 0, "visitors", 30)).toBeUndefined();
    expect(metricComparison(10, undefined, "visitors", 30)).toBeUndefined();
  });
});
