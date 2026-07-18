import { describe, expect, it } from "vitest";
import { formatChartAxisValue } from "./chart-value.js";

describe("chart axis values", () => {
  it("keeps values below one thousand unabridged", () => {
    expect(formatChartAxisValue(999)).toBe("999");
  });

  it("abbreviates values at and above one thousand", () => {
    expect(formatChartAxisValue(1_000)).toBe("1k");
    expect(formatChartAxisValue(1_500)).toBe("1.5k");
    expect(formatChartAxisValue(50_000)).toBe("50k");
  });
});
