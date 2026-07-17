import { describe, expect, it } from "vitest";
import { detectUtmCapability, isUtmDimension } from "./utm-capability.js";

describe("UTM capability detection", () => {
  it("marks UTM reports unavailable when only Plus dimensions return 402", () => {
    expect(detectUtmCapability(true, false, [402, 402, 402])).toBe("unavailable");
  });

  it("does not infer a plan limitation when the whole reporting window fails", () => {
    expect(detectUtmCapability(false, false, [402])).toBe("unknown");
  });

  it("marks successful UTM reports available", () => {
    expect(detectUtmCapability(true, true, [])).toBe("available");
  });

  it("keeps the capability available when one UTM dimension succeeds and another returns 402", () => {
    expect(detectUtmCapability(true, true, [402])).toBe("available");
  });

  it("recognizes only UTM breakdown dimensions", () => {
    expect(isUtmDimension("UtmCampaign")).toBe(true);
    expect(isUtmDimension("UtmTerm")).toBe(true);
    expect(isUtmDimension("UtmContent")).toBe(true);
    expect(isUtmDimension("Country")).toBe(false);
  });
});
