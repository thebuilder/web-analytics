// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => base,
}));
vi.mock("@umbraco-cms/backoffice/style", () => ({ UmbTextStyles: [] }));

import type { WebAnalyticsEventDetailsDialogElement } from "./event-details-dialog.element.js";
import "./event-details-dialog.element.js";

beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); });
afterEach(() => document.body.replaceChildren());

describe("event details dialog layout", () => {
  it("reserves the report height while initial details are loading", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.loading = true;
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector(".dialog-content")?.classList.contains("no-properties")).toBe(false);
    expect(dialog.shadowRoot?.querySelector(".loading")?.textContent).toContain("Loading event details");
  });

  it("keeps the report height and explains Plausible property configuration", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.eventName = "Read case";
    dialog.provider = "Plausible";
    dialog.propertiesEnabled = true;
    dialog.details = { eventName: "Read case", totals: { count: 15, visitors: 12 }, properties: [] };
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector(".dialog-content")?.classList.contains("no-properties")).toBe(false);
    expect(dialog.shadowRoot?.querySelector("umb-empty-state")?.getAttribute("headline")).toBe("No properties configured");
    expect(dialog.shadowRoot?.textContent).toContain("Add the Plausible custom property names");
    expect(dialog.shadowRoot?.querySelector('uui-button[href="/umbraco/section/settings/dashboard/web-analytics"]')).not.toBeNull();
  });

  it("renders property tabs as the first table heading without repeating the active property", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.eventName = "Read case";
    dialog.propertiesEnabled = true;
    dialog.details = {
      eventName: "Read case",
      totals: { count: 15, visitors: 12 },
      properties: [
        { name: "title", values: [] },
        { name: "locale", values: [] },
      ],
    };
    document.body.append(dialog);
    await dialog.updateComplete;

    const heading = dialog.shadowRoot?.querySelector("thead .property-heading");
    expect(heading?.querySelector('[role="tablist"]')).not.toBeNull();
    expect(heading?.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(dialog.shadowRoot?.querySelectorAll("thead th")).toHaveLength(3);
    expect(dialog.shadowRoot?.querySelector("thead")?.textContent?.match(/title/g)).toHaveLength(1);
  });

  it("does not render property controls when properties are unavailable", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.eventName = "Read case";
    dialog.filterProperty = "title";
    dialog.filterValue = "A case study";
    dialog.details = {
      eventName: "Read case",
      totals: { count: 15, visitors: 12 },
      properties: [{ name: "title", values: [{ value: "A case study", count: 15, visitors: 12 }] }],
    };
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector('[role="tablist"]')).toBeNull();
    expect(dialog.shadowRoot?.querySelector('uui-input[type="search"]')).toBeNull();
    expect(dialog.shadowRoot?.querySelector(".filter-button")).toBeNull();
    expect(dialog.shadowRoot?.querySelector(".active-filter")).toBeNull();
  });
});
