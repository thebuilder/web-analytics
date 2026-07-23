// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => class extends base {
    readonly localize = {
      number: (value: string | number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat("en-US", options).format(Number(value)),
    };
  },
}));
vi.mock("@umbraco-cms/backoffice/style", () => ({ UmbTextStyles: [] }));

import type { WebAnalyticsBreakdownDialogElement } from "./breakdown-dialog.element.js";
import type { WebAnalyticsBreakdownTableElement } from "./breakdown-table.element.js";
import "./breakdown-dialog.element.js";

beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); });
afterEach(() => { document.body.replaceChildren(); });

describe("breakdown dialog", () => {
  it("keeps traffic-source and UTM tabs inside the expanded table", async () => {
    const dialog = document.createElement("web-analytics-breakdown-dialog") as WebAnalyticsBreakdownDialogElement;
    dialog.headline = "UTM media";
    dialog.dimension = "UtmMedium";
    dialog.availableDimensions = ["ReferrerHostname", "UtmSource", "UtmMedium", "UtmCampaign", "UtmTerm", "UtmContent"];
    dialog.preferredUtmDimension = "UtmMedium";
    dialog.rows = [{ value: "email", visitors: 8, pageViews: 11 }];
    const onDimensionChange = vi.fn();
    dialog.addEventListener("breakdown-dimension-change", onDimensionChange);
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector("dialog")?.getAttribute("aria-label")).toBe("Traffic sources");
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-headline h2")).toBeNull();
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-close")?.getAttribute("aria-label")).toBe("Close Traffic sources");
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-headline-controls uui-input")?.getAttribute("label")).toBe("Search UTM media");
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-controls")).toBeNull();
    expect(dialog.shadowRoot?.querySelector('[slot="actions"]')).toBeNull();
    const table = dialog.shadowRoot?.querySelector<WebAnalyticsBreakdownTableElement>("web-analytics-breakdown-table")!;
    await table.updateComplete;
    expect([...table.shadowRoot?.querySelectorAll<HTMLButtonElement>('.report-tabs.primary [role="tab"]') ?? []]
      .map((tab) => tab.textContent?.trim())).toEqual(["Referrers", "UTM"]);
    const tabs = [...table.shadowRoot?.querySelectorAll<HTMLButtonElement>('.report-tabs.secondary [role="tab"]') ?? []];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Source", "Medium", "Campaign", "Term", "Content"]);
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(dialog.shadowRoot?.querySelector("uui-input")?.getAttribute("label")).toBe("Search UTM media");
    expect(table.rowLabel).toBe("Medium");

    tabs[2]?.click();

    expect((onDimensionChange.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      dimension: "UtmCampaign",
      headline: "UTM campaigns",
    });
  });

  it("uses a singular column label without adding tabs to a plain breakdown", async () => {
    const dialog = document.createElement("web-analytics-breakdown-dialog") as WebAnalyticsBreakdownDialogElement;
    dialog.headline = "Countries";
    dialog.dimension = "Country";
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector("dialog")?.getAttribute("aria-label")).toBe("Countries");
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-headline h2")).toBeNull();
    expect(dialog.shadowRoot?.querySelector("uui-input")?.getAttribute("label")).toBe("Search Countries");
    const table = dialog.shadowRoot?.querySelector<WebAnalyticsBreakdownTableElement>("web-analytics-breakdown-table")!;
    await table.updateComplete;
    expect(table.rowLabel).toBe("Country");
    expect(table.shadowRoot?.querySelector(".report-tabs")).toBeNull();
    expect([...table.shadowRoot?.querySelectorAll("thead th") ?? []].map((header) => header.textContent?.trim())).toEqual([
      "Country",
      "Visitors",
      "Page views",
    ]);
  });

  it("keeps percentage-dimension visitor share beside the visitor count", async () => {
    const dialog = document.createElement("web-analytics-breakdown-dialog") as WebAnalyticsBreakdownDialogElement;
    dialog.headline = "Countries";
    dialog.dimension = "Country";
    dialog.metric = "pageViews";
    dialog.rows = [
      { value: "DK", visitors: 10, pageViews: 30 },
      { value: "US", visitors: 10, pageViews: 10 },
    ];
    document.body.append(dialog);
    await dialog.updateComplete;
    const table = dialog.shadowRoot?.querySelector<WebAnalyticsBreakdownTableElement>("web-analytics-breakdown-table")!;
    await table.updateComplete;

    const shares = [...table.shadowRoot?.querySelectorAll<HTMLElement>(".metric-share") ?? []];
    expect(shares.map((share) => share.textContent)).toEqual(["50%", "50%"]);
    expect(shares.every((share) => share.closest("td")?.cellIndex === 1)).toBe(true);
    expect([...shares[0].parentElement?.children ?? []].map((element) => element.className)).toEqual([
      "filter-action",
      "metric-share",
      "metric-number",
    ]);
  });

  it("keeps audience tabs inside the table header", async () => {
    const dialog = document.createElement("web-analytics-breakdown-dialog") as WebAnalyticsBreakdownDialogElement;
    dialog.headline = "Devices";
    dialog.dimension = "DeviceType";
    dialog.availableDimensions = ["DeviceType", "BrowserName"];
    const onDimensionChange = vi.fn();
    dialog.addEventListener("breakdown-dimension-change", onDimensionChange);
    document.body.append(dialog);
    await dialog.updateComplete;
    const table = dialog.shadowRoot?.querySelector<WebAnalyticsBreakdownTableElement>("web-analytics-breakdown-table")!;
    await table.updateComplete;

    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-headline h2")).toBeNull();
    const tabs = [...table.shadowRoot?.querySelectorAll<HTMLButtonElement>('.report-tabs.primary [role="tab"]') ?? []];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Devices", "Browsers"]);
    expect(tabs[0]?.getAttribute("aria-controls")).toBe("breakdown-report-panel");
    expect(table.shadowRoot?.querySelector("table")?.getAttribute("aria-labelledby")).toBe("expanded-audience-tab-0");
    tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await Promise.resolve();
    expect((onDimensionChange.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      dimension: "BrowserName",
      headline: "Browsers",
    });
    expect(table.shadowRoot?.activeElement).toBe(tabs[1]);
  });

  it("does not render unsupported grouped dimensions", async () => {
    const dialog = document.createElement("web-analytics-breakdown-dialog") as WebAnalyticsBreakdownDialogElement;
    dialog.headline = "Referrers";
    dialog.dimension = "ReferrerHostname";
    dialog.availableDimensions = ["ReferrerHostname"];
    document.body.append(dialog);
    await dialog.updateComplete;
    const table = dialog.shadowRoot?.querySelector<WebAnalyticsBreakdownTableElement>("web-analytics-breakdown-table")!;
    await table.updateComplete;

    expect([...table.shadowRoot?.querySelectorAll<HTMLButtonElement>('.report-tabs.primary [role="tab"]') ?? []]
      .map((tab) => tab.textContent?.trim())).toEqual(["Referrers"]);
    expect(table.shadowRoot?.querySelector('.report-tabs.secondary')).toBeNull();
  });
});
