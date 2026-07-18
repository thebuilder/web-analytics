import { describe, expect, it } from "vitest";
import { dashboardCards, requestedDimensions, selectedCardDimension } from "./dashboard-cards.js";

describe("dashboardCards", () => {
  it("models pages globally and omits them for a document", () => {
    expect(requestedDimensions(dashboardCards(false, "available"))).toContain("RequestPath");
    expect(requestedDimensions(dashboardCards(true, "available"))).not.toContain("RequestPath");
  });

  it("models audience and UTM dimensions as tabbed cards", () => {
    const cards = dashboardCards(false, "available");
    expect(cards.find((card) => card.kind === "tabbed-breakdown" && card.id === "audience")).toBeDefined();
    expect(cards.find((card) => card.kind === "tabbed-breakdown" && card.id === "utm")).toBeDefined();
    expect(requestedDimensions(cards)).toEqual(expect.arrayContaining([
      "UtmSource", "UtmMedium", "UtmCampaign", "UtmTerm", "UtmContent",
    ]));
  });

  it("removes the UTM card when the capability is unavailable", () => {
    expect(requestedDimensions(dashboardCards(false, "unavailable")))
      .not.toEqual(expect.arrayContaining(["UtmSource", "UtmMedium", "UtmCampaign", "UtmTerm", "UtmContent"]));
  });

  it("selects the active option from a tabbed card", () => {
    const audience = dashboardCards(false, "available").find((card) => card.kind === "tabbed-breakdown" && card.id === "audience");
    expect(audience && selectedCardDimension(audience, "BrowserName", "UtmSource").dimension).toBe("BrowserName");
  });
});
