// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => class extends base {
    readonly localize = { number: (value: number) => value.toLocaleString() };
  },
}));
vi.mock("@umbraco-cms/backoffice/style", () => ({ UmbTextStyles: [] }));

import type { WebAnalyticsEventDetailsDialogElement } from "./event-details-dialog.element.js";
import "./event-details-dialog.element.js";

beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); });
afterEach(() => document.body.replaceChildren());

describe("event details dialog layout", () => {
  it("returns to the Events list from the header", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.eventName = "Signup completed";
    const onBack = vi.fn();
    dialog.addEventListener("back-to-events", onBack);
    document.body.append(dialog);
    await dialog.updateComplete;

    const back = dialog.shadowRoot?.querySelector<HTMLButtonElement>(".analytics-dialog-back");
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-headline h2")?.contains(back ?? null)).toBe(true);
    expect(back?.textContent).toContain("Signup completed");
    expect(back?.getAttribute("aria-label")).toBe("Back to all events from Signup completed");
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-back uui-icon")?.getAttribute("name")).toBe("icon-navigation-left");
    back?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("reserves the report height while initial details are loading", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.loading = true;
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector(".dialog-content")?.classList.contains("no-properties")).toBe(false);
    expect(dialog.shadowRoot?.querySelector(".loading")?.textContent).toContain("Loading event details");
  });

  it("keeps the report height and explains missing property data", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.eventName = "Read case";
    dialog.propertiesEnabled = true;
    dialog.details = { eventName: "Read case", totals: { count: 15, visitors: 12 }, properties: [] };
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector(".dialog-content")?.classList.contains("no-properties")).toBe(false);
    expect(dialog.shadowRoot?.querySelector("umb-empty-state")?.getAttribute("headline")).toBe("No property data");
    expect(dialog.shadowRoot?.textContent).toContain("No custom property values were found");
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

  it("does not leave an empty search area when the active property has no values", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.eventName = "Signup completed";
    dialog.propertiesEnabled = true;
    dialog.details = {
      eventName: "Signup completed",
      totals: { count: 15, visitors: 12 },
      properties: [{ name: "plan", values: [] }],
    };
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector(".property-controls")).toBeNull();
    expect(dialog.shadowRoot?.querySelector('uui-input[type="search"]')).toBeNull();
  });

  it("shows a table skeleton while an uncached property tab is loading", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.eventName = "Signup completed";
    dialog.propertiesEnabled = true;
    dialog.searchLoading = true;
    dialog.details = {
      eventName: "Signup completed",
      totals: { count: 15, visitors: 12 },
      properties: [{ name: "source", values: [] }],
    };
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelectorAll(".skeleton-line")).toHaveLength(6);
    expect(dialog.shadowRoot?.textContent).not.toContain("No values were recorded");
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

  it("emphasizes metrics without emphasizing the property value", async () => {
    const dialog = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    dialog.eventName = "Signup completed";
    dialog.propertiesEnabled = true;
    dialog.details = {
      eventName: "Signup completed",
      totals: { count: 15, visitors: 12 },
      properties: [{ name: "plan", values: [{ value: "Pro", count: 15, visitors: 12 }] }],
    };
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector("tbody th strong")).toBeNull();
    expect([...dialog.shadowRoot?.querySelectorAll("tbody td strong") ?? []].map((metric) => metric.textContent)).toEqual(["12", "15"]);
  });
});
