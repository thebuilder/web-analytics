import { describe, expect, it } from "vitest";
import { reportErrorMessage } from "./report-error.js";

describe("report error guidance", () => {
  it("explains authentication failures without exposing server details", () => {
    expect(reportErrorMessage({ status: 502, code: "invalid_credentials" })).toContain("access token");
  });

  it("explains plan and reporting-window failures", () => {
    expect(reportErrorMessage({ status: 402, code: "plan_limit" })).toContain("reporting window");
  });

  it("distinguishes upstream timeouts from configuration failures", () => {
    expect(reportErrorMessage({ status: 504, code: "upstream_timeout" })).toContain("did not respond in time");
  });

  it("explains temporary report capacity without blaming configuration", () => {
    expect(reportErrorMessage({ status: 503, code: "report_capacity" })).toBe("Analytics is busy. Try again shortly.");
  });

  it("uses safe generic guidance for unknown errors", () => {
    expect(reportErrorMessage(new Error("secret upstream message"))).not.toContain("secret");
  });
});
