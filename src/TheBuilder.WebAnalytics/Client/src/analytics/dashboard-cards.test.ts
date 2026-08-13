import { describe, expect, it } from "vitest";
import { dashboardCards, dashboardReportPlan, selectedCardDimension } from "./dashboard-cards.js";

describe("dashboardCards", () => {
  it("models pages", () => {
    expect(reportPlan().dimensions).toContain("RequestPath");
  });

  it("models audience and UTM dimensions as tabbed cards without eagerly loading hidden UTM tabs", () => {
    const { cards, dimensions } = reportPlan();
    expect(cards.find((card) => card.kind === "tabbed-breakdown" && card.id === "audience")).toBeDefined();
    expect(cards.find((card) => card.kind === "tabbed-breakdown" && card.id === "utm")).toBeDefined();
    expect(dimensions).toEqual(expect.arrayContaining(["DeviceType", "BrowserName"]));
    expect(dimensions).not.toEqual(expect.arrayContaining([
      "UtmSource", "UtmMedium", "UtmCampaign", "UtmTerm", "UtmContent",
    ]));
  });

  it("expresses the UTM probe and selected on-demand report in the report plan", () => {
    expect(reportPlan({ utmCapability: "unknown" }).dimensions).toEqual(expect.arrayContaining(["UtmSource"]));
    expect(reportPlan({ acquisitionView: "utm", utmDimension: "UtmCampaign" }).dimensions)
      .toEqual(expect.arrayContaining(["UtmCampaign"]));
    expect(reportPlan({ acquisitionView: "utm", utmDimension: "UtmCampaign" }).dimensions).not.toEqual(expect.arrayContaining([
      "UtmSource", "UtmMedium", "UtmTerm", "UtmContent",
    ]));
    expect(reportPlan({ utmCapability: "unavailable" }).dimensions).not.toEqual(expect.arrayContaining([
      "UtmSource", "UtmMedium", "UtmCampaign", "UtmTerm", "UtmContent",
    ]));
  });

  it("shows the UTM card only after capability is known to be available", () => {
    for (const capability of ["unknown", "unavailable"] as const) {
      expect(dashboardCards(capability).some((card) => card.kind === "tabbed-breakdown" && card.id === "utm")).toBe(false);
    }
  });

  it("selects the active option from a tabbed card", () => {
    const audience = dashboardCards("available").find((card) => card.kind === "tabbed-breakdown" && card.id === "audience");
    expect(audience && selectedCardDimension(audience, "BrowserName", "UtmSource").dimension).toBe("BrowserName");
  });
});

type ReportPlanOverrides = {
  utmCapability?: Parameters<typeof dashboardReportPlan>[0];
  acquisitionView?: Parameters<typeof dashboardReportPlan>[1];
  utmDimension?: Parameters<typeof dashboardReportPlan>[2];
};

function reportPlan(overrides: ReportPlanOverrides = {}) {
  return dashboardReportPlan(
    overrides.utmCapability ?? "available",
    overrides.acquisitionView ?? "referrers",
    overrides.utmDimension ?? "UtmSource",
  );
}
