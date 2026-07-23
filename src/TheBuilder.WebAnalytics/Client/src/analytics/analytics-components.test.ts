// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  connections: vi.fn(),
  documentRoutes: vi.fn(),
  summary: vi.fn(),
  events: vi.fn(),
  flags: vi.fn(),
  breakdown: vi.fn(),
  eventDetails: vi.fn(),
  eventPropertyValues: vi.fn(),
}));
vi.mock("../api/sdk.gen.js", () => ({ WebAnalyticsService: sdk }));
vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => class extends base {
    readonly localize = {
      lang: () => this.lang || "en-US",
      number: (value: string | number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(this.lang || "en-US", options).format(Number(value)),
    };
  },
}));
vi.mock("@umbraco-cms/backoffice/style", () => ({ UmbTextStyles: [] }));

import { dateRangeForPreset } from "./date-range.js";
import { loadingState, successState } from "./async-state.js";
import { dashboardCards } from "./dashboard-cards.js";
import type { WebAnalyticsSummaryElement } from "./analytics-summary.element.js";
import type { WebAnalyticsBreakdownGridElement } from "./analytics-breakdown-grid.element.js";
import type { WebAnalyticsBreakdownTableElement } from "./breakdown-table.element.js";
import type { WebAnalyticsEventTableElement } from "./event-table.element.js";
import type { WebAnalyticsDashboardElement } from "./analytics-dashboard.element.js";
import type { WebAnalyticsDashboardHeaderElement } from "./analytics-dashboard-header.element.js";
import type { WebAnalyticsFlagCardElement } from "./flag-card.element.js";
import type { WebAnalyticsEventDetailsDialogElement } from "./event-details-dialog.element.js";
import "./analytics-summary.element.js";
import "./analytics-breakdown-grid.element.js";
import "./analytics-dashboard.element.js";
import "./analytics-dashboard-header.element.js";

beforeEach(() => {
  sdk.connections.mockResolvedValue(apiOk({
    enabled: true,
    defaultRangeDays: 30,
    connections: [{
      key: "11111111-1111-1111-1111-111111111111",
      displayName: "Main",
      provider: "Vercel",
      capabilities: { dimensions: ["RequestPath", "Route", "ReferrerHostname", "Country", "DeviceType", "BrowserName", "OsName", "UtmSource", "UtmMedium", "UtmCampaign", "UtmTerm", "UtmContent", "EventName"], events: true, eventDetails: true, eventProperties: true, globalEventFiltering: false, flags: true, breakdownOrdering: false },
      isDefault: true,
      isConfigured: true,
      baseUrl: "https://example.com",
      warnings: [],
    }],
  }));
  sdk.documentRoutes.mockResolvedValue(apiOk([]));
  sdk.summary.mockResolvedValue(apiOk({ totals: { visitors: 12, pageViews: 34 }, points: [] }));
  sdk.events.mockResolvedValue(apiOk({ rows: [] }));
  sdk.flags.mockResolvedValue(apiOk({ rows: [] }));
  sdk.breakdown.mockResolvedValue(apiOk({ rows: [] }));
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("analytics presentation components", () => {
  it("links document analytics to the resolved page URL", async () => {
    const element = document.createElement("web-analytics-dashboard-header") as WebAnalyticsDashboardHeaderElement;
    element.documentScoped = true;
    element.range = dateRangeForPreset(30);
    element.siteUrl = "https://example.com";
    element.route = {
      connection: "11111111-1111-1111-1111-111111111111",
      provider: "Vercel",
      capabilities: { dimensions: ["RequestPath"], events: true, eventDetails: true, eventProperties: true, globalEventFiltering: false, flags: true, breakdownOrdering: false },
      culture: "en-US",
      hostname: "example.com",
      path: "/products/example",
      url: "https://example.com/products/example",
      isCurrent: true,
      warnings: [],
    };
    document.body.append(element);
    await element.updateComplete;

    const link = element.shadowRoot?.querySelector<HTMLAnchorElement>(".site-link");
    const favicon = element.shadowRoot?.querySelector<HTMLImageElement>(".site-favicon");
    expect(link?.href).toBe("https://example.com/products/example");
    expect(link?.textContent).toContain("Open page in a new tab");
    expect(favicon?.src).toBe("https://www.google.com/s2/favicons?domain=example.com&sz=32");
    expect(favicon?.alt).toBe("");
    expect(favicon?.width).toBe(20);
    expect(favicon?.height).toBe(20);
    expect(favicon?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(element.shadowRoot?.querySelector(".site-mark uui-icon")).toBeNull();

    favicon?.dispatchEvent(new Event("error"));
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector(".site-favicon")).toBeNull();
    expect(element.shadowRoot?.querySelector(".site-mark uui-icon")).not.toBeNull();
  });

  it("directs first-time users to Web Analytics settings", async () => {
    sdk.connections.mockResolvedValue(apiOk({ enabled: true, defaultRangeDays: 30, connections: [] }));
    const element = document.createElement("web-analytics-dashboard") as WebAnalyticsDashboardElement;
    document.body.append(element);

    await vi.waitFor(() => expect(element.shadowRoot?.querySelector("umb-empty-state")?.getAttribute("headline")).toBe("Connect Web Analytics"));

    const action = element.shadowRoot?.querySelector("uui-button");
    expect(action?.getAttribute("href")).toBe("/umbraco/section/settings/dashboard/web-analytics");
    expect(action?.getAttribute("label")).toBe("Open Web Analytics settings");
  });

  it("replaces reports with connection setup guidance when credentials are missing", async () => {
    sdk.connections.mockResolvedValue(apiOk({
      enabled: true,
      defaultRangeDays: 30,
      connections: [{
        key: "11111111-1111-1111-1111-111111111111",
        displayName: "Production",
        provider: "Vercel",
        capabilities: { dimensions: ["RequestPath", "Country"], events: true, eventDetails: true, eventProperties: true, globalEventFiltering: false, flags: true, breakdownOrdering: false },
        isDefault: true,
        isConfigured: false,
        baseUrl: "https://example.com",
        warnings: ["No server-side credential is configured for this connection."],
      }],
    }));
    const element = document.createElement("web-analytics-dashboard") as WebAnalyticsDashboardElement;
    document.body.append(element);

    await vi.waitFor(() => expect(element.shadowRoot?.querySelector("#connection-setup-title")?.textContent).toBe("Connection credentials required"));

    const header = element.shadowRoot?.querySelector<WebAnalyticsDashboardHeaderElement>("web-analytics-dashboard-header");
    await header?.updateComplete;
    expect(element.shadowRoot?.querySelector("web-analytics-summary")).toBeNull();
    expect(element.shadowRoot?.querySelector("web-analytics-breakdown-grid")).toBeNull();
    expect(header?.shadowRoot?.querySelector("web-analytics-date-range-picker")).toBeNull();
    expect(element.shadowRoot?.querySelector(".connection-setup p")?.textContent).toContain("server-side credentials");
    expect(element.shadowRoot?.querySelector(".connection-setup uui-button")?.getAttribute("href")).toBe("/umbraco/section/settings/dashboard/web-analytics");
  });

  it("emits metric changes from the summary tabs", async () => {
    const element = document.createElement("web-analytics-summary") as WebAnalyticsSummaryElement;
    element.range = dateRangeForPreset(30);
    element.metric = "visitors";
    element.report = successState({ totals: { visitors: 12, pageViews: 34 }, points: [] });
    const onChange = vi.fn();
    element.addEventListener("metric-change", onChange);
    document.body.append(element);
    await element.updateComplete;

    element.shadowRoot?.querySelector<HTMLButtonElement>("#metric-pageViews-tab")?.click();

    expect(onChange).toHaveBeenCalledOnce();
    expect((onChange.mock.calls[0][0] as CustomEvent).detail).toEqual({ metric: "pageViews" });
  });

  it("formats summary totals with the active backoffice locale", async () => {
    const element = document.createElement("web-analytics-summary") as WebAnalyticsSummaryElement;
    element.lang = "da-DK";
    element.range = dateRangeForPreset(30);
    element.metric = "visitors";
    element.report = successState({ totals: { visitors: 185_508, pageViews: 34 }, points: [] });
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("#metric-visitors-tab strong")?.textContent).toBe("185.508");
  });

  it("keeps the previous summary visible while a filtered report refreshes", async () => {
    const element = document.createElement("web-analytics-summary") as WebAnalyticsSummaryElement;
    element.range = dateRangeForPreset(30);
    element.metric = "visitors";
    element.report = loadingState(successState({ totals: { visitors: 12, pageViews: 34 }, points: [] }));
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector(".history")?.getAttribute("aria-busy")).toBe("true");
    expect(element.shadowRoot?.querySelector("#metric-visitors-tab strong")?.textContent).toBe("12");
    expect(element.shadowRoot?.querySelector(".metric-skeleton")).toBeNull();
    expect(element.shadowRoot?.querySelector(".chart-skeleton")).toBeNull();
  });

  it("keeps previous breakdown, event, and flag rows visible while filters refresh", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unavailable").filter((card) => card.kind === "breakdown" && card.dimension === "Country");
    element.breakdowns = {
      Country: loadingState(successState({ dimension: "Country", rows: [{ value: "DK", visitors: 12, pageViews: 18 }] })),
    };
    element.events = loadingState(successState({ rows: [{ eventName: "Signup", visitors: 8, count: 9 }] }));
    element.flags = loadingState(successState({ rows: [{ value: "new-checkout", visitors: 5, pageViews: 7 }] }));
    document.body.append(element);
    await element.updateComplete;

    const breakdown = element.shadowRoot?.querySelector<WebAnalyticsBreakdownTableElement>("web-analytics-breakdown-table");
    const events = element.shadowRoot?.querySelector<WebAnalyticsEventTableElement>("web-analytics-event-table");
    const flags = element.shadowRoot?.querySelector<WebAnalyticsFlagCardElement>("web-analytics-flag-card");
    await Promise.all([breakdown?.updateComplete, events?.updateComplete, flags?.updateComplete]);

    expect(breakdown?.loading).toBe(false);
    expect(breakdown?.shadowRoot?.querySelector(".row-label")?.textContent).toContain("Denmark");
    expect(events?.loading).toBe(false);
    expect(events?.shadowRoot?.querySelector(".details-action")?.textContent).toBe("Signup");
    expect(flags?.shadowRoot?.querySelector(".value")?.textContent).toBe("new-checkout");
    expect(element.shadowRoot?.querySelectorAll('[aria-busy="true"]')).toHaveLength(3);
  });

  it("emits audience changes from the breakdown tabs", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unavailable").filter((card) => card.kind === "tabbed-breakdown" && card.id === "audience");
    element.audienceDimension = "DeviceType";
    element.breakdowns = {
      DeviceType: successState({ dimension: "DeviceType", rows: [] }),
      BrowserName: successState({ dimension: "BrowserName", rows: [] }),
    };
    element.events = successState({ rows: [] });
    const onChange = vi.fn();
    element.addEventListener("audience-change", onChange);
    document.body.append(element);
    await element.updateComplete;

    const table = [...element.shadowRoot?.querySelectorAll("web-analytics-breakdown-table") ?? []]
      .find((candidate) => (candidate as WebAnalyticsBreakdownTableElement).headingTabs?.ariaLabel === "Audience technology") as WebAnalyticsBreakdownTableElement;
    await table.updateComplete;
    const browserTab = [...table.shadowRoot?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? []]
      .find((button) => button.textContent?.trim() === "Browsers");
    browserTab?.click();

    expect(onChange).toHaveBeenCalledOnce();
    expect((onChange.mock.calls[0][0] as CustomEvent).detail).toEqual({ dimension: "BrowserName" });
  });

  it("keeps audience cards as percentages of the selected metric", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unavailable").filter((card) => card.kind === "tabbed-breakdown" && card.id === "audience");
    element.audienceDimension = "DeviceType";
    element.metric = "visitors";
    element.breakdowns = {
      DeviceType: successState({
        dimension: "DeviceType",
        rows: [
          { value: "Desktop", visitors: 11_259, pageViews: 17_380 },
          { value: "Unknown", visitors: 80, pageViews: 10 },
          { value: "Others", visitors: 36, pageViews: 5 },
        ],
      }),
    };
    element.events = successState({ rows: [] });
    document.body.append(element);
    await element.updateComplete;

    const table = element.shadowRoot?.querySelector<WebAnalyticsBreakdownTableElement>("web-analytics-breakdown-table")!;
    await table.updateComplete;
    expect(table.total).toBe(11_339);
    const headers = [...table.shadowRoot?.querySelectorAll("thead th") ?? []]
      .map((header) => header.textContent?.replace(/\s+/g, "").trim());
    expect(headers).toEqual(["DevicesBrowsers", "Visitors"]);
    const values = [...table.shadowRoot?.querySelectorAll("tbody .percentage-value > span:first-child") ?? []]
      .map((value) => value.textContent?.trim());
    expect(values).toEqual(["99%", "1%"]);
  });

  it("keeps standard cards focused on the selected metric", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unavailable").filter((card) => card.kind === "breakdown" && card.dimension === "RequestPath");
    element.metric = "pageViews";
    element.breakdowns = {
      RequestPath: successState({ dimension: "RequestPath", rows: [{ value: "/", visitors: 8_525, pageViews: 15_119 }] }),
    };
    element.events = successState({ rows: [] });
    document.body.append(element);
    await element.updateComplete;

    const table = element.shadowRoot?.querySelector<WebAnalyticsBreakdownTableElement>("web-analytics-breakdown-table")!;
    await table.updateComplete;
    expect([...table.shadowRoot?.querySelectorAll("thead th") ?? []].map((header) => header.textContent?.trim())).toEqual(["Pages", "Page views"]);
    expect([...table.shadowRoot?.querySelectorAll(".metric-number") ?? []].map((value) => value.textContent)).toEqual(["15,119"]);
    expect(table.shadowRoot?.querySelector(".metric-cell .filter-action")).not.toBeNull();
    expect(table.shadowRoot?.querySelector(".row-value .filter-action")).toBeNull();
  });

  it.each(["ReferrerHostname", "Referrer"] as const)("renders %s rows as secure external links with favicons for attributed hosts", async (dimension) => {
    const element = document.createElement("web-analytics-breakdown-table") as WebAnalyticsBreakdownTableElement;
    element.dimension = dimension;
    element.rows = [
      { value: "google.com", visitors: 22_304, pageViews: 30_000 },
      { value: "Unknown", visitors: 1, pageViews: 1 },
    ];
    document.body.append(element);
    await element.updateComplete;

    const link = element.shadowRoot?.querySelector<HTMLAnchorElement>(".row-label a");
    expect(link?.href).toBe("https://google.com/");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
    expect(link?.querySelector("uui-icon")?.getAttribute("name")).toBe("icon-out");
    const favicons = element.shadowRoot?.querySelectorAll<HTMLImageElement>(".referrer-favicon");
    expect(favicons).toHaveLength(1);
    expect(favicons?.[0]?.src).toBe("https://www.google.com/s2/favicons?domain=google.com&sz=32");
    expect(favicons?.[0]?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect([...element.shadowRoot?.querySelectorAll(".row-label") ?? []].map((label) => label.textContent?.trim())).toEqual(["google.com (opens in a new tab)", "Unknown"]);
    expect([...element.shadowRoot?.querySelectorAll(".metric-number") ?? []].map((value) => value.textContent)).toEqual(["22,304", "30,000", "1", "1"]);
  });

  it("renders local browser marks and a globe for unrecognised browser values", async () => {
    const element = document.createElement("web-analytics-breakdown-table") as WebAnalyticsBreakdownTableElement;
    element.dimension = "BrowserName";
    element.rows = [
      { value: "Chrome", visitors: 22_304, pageViews: 30_000 },
      { value: "Mobile App", visitors: 1, pageViews: 1 },
    ];
    document.body.append(element);
    await element.updateComplete;

    const icons = element.shadowRoot?.querySelectorAll<HTMLElement>(".breakdown-value-icon");
    expect(icons).toHaveLength(2);
    expect(icons?.[0]?.tagName).toBe("IMG");
    expect((icons?.[0] as HTMLImageElement | undefined)?.getAttribute("src")).toBe("/App_Plugins/TheBuilder.WebAnalytics/icons/browsers/chrome.svg");
    expect(icons?.[1]?.tagName).toBe("UUI-ICON");
    expect(icons?.[1]?.getAttribute("name")).toBe("icon-globe");
  });

  it("renders local operating system marks and a globe for unrecognised values", async () => {
    const element = document.createElement("web-analytics-breakdown-table") as WebAnalyticsBreakdownTableElement;
    element.dimension = "OsName";
    element.rows = [
      { value: "Windows", visitors: 22_304, pageViews: 30_000 },
      { value: "iOS", visitors: 2_304, pageViews: 3_000 },
      { value: "(not set)", visitors: 1, pageViews: 1 },
    ];
    document.body.append(element);
    await element.updateComplete;

    const icons = element.shadowRoot?.querySelectorAll<HTMLElement>(".breakdown-value-icon");
    expect(icons).toHaveLength(3);
    expect((icons?.[0] as HTMLImageElement | undefined)?.getAttribute("src")).toBe("/App_Plugins/TheBuilder.WebAnalytics/icons/operating-systems/windows.svg");
    expect((icons?.[1] as HTMLImageElement | undefined)?.getAttribute("src")).toBe("/App_Plugins/TheBuilder.WebAnalytics/icons/operating-systems/ios.svg");
    expect(icons?.[2]?.getAttribute("name")).toBe("icon-globe");
  });

  it("renders native Umbraco icons for device categories", async () => {
    const element = document.createElement("web-analytics-breakdown-table") as WebAnalyticsBreakdownTableElement;
    element.dimension = "DeviceType";
    element.rows = [
      { value: "Desktop", visitors: 22_304, pageViews: 30_000 },
      { value: "Mobile", visitors: 1_204, pageViews: 2_000 },
      { value: "Tablet", visitors: 304, pageViews: 500 },
    ];
    document.body.append(element);
    await element.updateComplete;

    const icons = [...element.shadowRoot?.querySelectorAll(".breakdown-value-icon") ?? []];
    expect(icons.map((icon) => icon.getAttribute("name"))).toEqual(["icon-desktop", "icon-mobile", "icon-ipad"]);
  });

  it("keeps document traffic breakdowns ahead of optional reports", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(true, "unavailable");
    element.events = successState({ rows: [{ eventName: "Signup", visitors: 12, count: 18 }] });
    document.body.append(element);
    await element.updateComplete;

    const cards = [...element.shadowRoot?.querySelectorAll("uui-box") ?? []];
    expect(cards.slice(0, 4).map((card) => card.querySelector<HTMLElement & { headline: string }>("web-analytics-breakdown-table")?.headline)).toEqual([
      "Referrers",
      "Countries",
      "Devices",
      "Operating systems",
    ]);
    expect(cards[4]?.querySelector("web-analytics-event-table")).not.toBeNull();
    expect(cards[5]?.querySelector("web-analytics-flag-card")).not.toBeNull();
  });

  it("keeps View all actions low priority while retaining emphasis for Retry", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unavailable").filter((card) => card.kind === "breakdown" && card.dimension === "Country");
    element.breakdowns = {
      Country: successState({ dimension: "Country", rows: [{ value: "DK", visitors: 12, pageViews: 18 }] }),
    };
    element.events = successState({ rows: [{ eventName: "Signup", visitors: 8, count: 9 }] });
    element.supportsFlags = false;
    document.body.append(element);
    await element.updateComplete;

    const viewAllActions = [...element.shadowRoot?.querySelectorAll("uui-button") ?? []]
      .filter((button) => button.textContent?.trim() === "View all");
    expect(viewAllActions).toHaveLength(2);
    expect(viewAllActions.every((button) => button.getAttribute("look") === "default")).toBe(true);
    expect(viewAllActions.every((button) => button.classList.contains("view-all") && button.hasAttribute("compact"))).toBe(true);

    element.breakdowns = { Country: { status: "error", message: "Unavailable" } };
    element.supportsEvents = false;
    await element.updateComplete;

    const retry = element.shadowRoot?.querySelector("uui-button");
    expect(retry?.textContent?.trim()).toBe("Retry");
    expect(retry?.getAttribute("look")).toBe("secondary");
  });

  it("groups Events and Flags as optional reports in the overview", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unavailable");
    element.events = successState({ rows: [] });
    document.body.append(element);
    await element.updateComplete;

    const featureGrid = element.shadowRoot?.querySelector(".feature-grid");
    const cards = [...featureGrid?.querySelectorAll("uui-box") ?? []];
    const flagsCard = cards[1];
    expect(flagsCard?.querySelector("web-analytics-flag-card")).not.toBeNull();
    expect(flagsCard?.classList.contains("flags-card")).toBe(true);
    expect(cards[0]?.querySelector("web-analytics-event-table")).not.toBeNull();
  });

  it("keeps a lone optional report in one feature-grid track", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(true, "unavailable");
    element.supportsEvents = false;
    element.supportsFlags = true;
    element.events = successState({ rows: [] });
    document.body.append(element);
    await element.updateComplete;

    const featureGrid = element.shadowRoot?.querySelector<HTMLElement>(".feature-grid");
    const cards = [...featureGrid?.querySelectorAll("uui-box") ?? []];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.querySelector("web-analytics-flag-card")).not.toBeNull();
    const styles = [...element.shadowRoot?.querySelectorAll("style") ?? []].map((style) => style.textContent).join("\n");
    expect(styles).toContain(".feature-grid");
    expect(styles).toContain("repeat(auto-fill");
  });

  it("merges valid UTM reports into the referrers card with five parameter tabs", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "available");
    element.breakdowns = {
      ReferrerHostname: successState({ dimension: "ReferrerHostname", rows: [{ value: "google.com", visitors: 8, pageViews: 10 }] }),
      UtmSource: successState({ dimension: "UtmSource", rows: [{ value: "newsletter", visitors: 5, pageViews: 6 }] }),
      UtmMedium: successState({ dimension: "UtmMedium", rows: [] }),
      UtmCampaign: successState({ dimension: "UtmCampaign", rows: [] }),
      UtmTerm: successState({ dimension: "UtmTerm", rows: [] }),
      UtmContent: successState({ dimension: "UtmContent", rows: [] }),
    };
    element.events = successState({ rows: [] });
    const onChange = vi.fn();
    const onAcquisitionChange = vi.fn();
    element.addEventListener("utm-change", onChange);
    element.addEventListener("acquisition-change", onAcquisitionChange);
    document.body.append(element);
    await element.updateComplete;

    const acquisitionTable = [...element.shadowRoot?.querySelectorAll("web-analytics-breakdown-table") ?? []]
      .find((table) => (table as WebAnalyticsBreakdownTableElement).headingTabs?.ariaLabel === "Traffic source") as WebAnalyticsBreakdownTableElement;
    await acquisitionTable.updateComplete;
    const topTabs = [...acquisitionTable.shadowRoot?.querySelectorAll<HTMLButtonElement>(".report-tabs.primary [role=tab]") ?? []];
    expect(topTabs.map((tab) => tab.textContent?.trim())).toEqual(["Referrers", "UTM"]);
    topTabs[1]?.click();
    expect((onAcquisitionChange.mock.calls[0][0] as CustomEvent).detail).toEqual({ view: "utm" });
    element.acquisitionView = "utm";
    await element.updateComplete;

    const updatedAcquisitionTable = [...element.shadowRoot?.querySelectorAll("web-analytics-breakdown-table") ?? []]
      .find((table) => (table as WebAnalyticsBreakdownTableElement).headingTabs?.ariaLabel === "Traffic source") as WebAnalyticsBreakdownTableElement;
    await updatedAcquisitionTable.updateComplete;
    const parameterTabs = [...updatedAcquisitionTable.shadowRoot?.querySelectorAll<HTMLButtonElement>(".report-tabs.secondary [role=tab]") ?? []];
    expect(parameterTabs.map((tab) => tab.textContent?.trim())).toEqual(["Source", "Medium", "Campaign", "Term", "Content"]);
    const headerRows = updatedAcquisitionTable.shadowRoot?.querySelectorAll("thead tr");
    expect([...headerRows?.[0].children ?? []].map((header) => header.textContent?.replace(/\s+/g, "").trim())).toEqual(["ReferrersUTM", "Visitors"]);
    expect(headerRows?.[0].lastElementChild?.hasAttribute("rowspan")).toBe(false);
    expect(headerRows?.[1].firstElementChild?.getAttribute("colspan")).toBe("2");
    parameterTabs[4]?.click();
    expect((onChange.mock.calls[0][0] as CustomEvent).detail).toEqual({ dimension: "UtmContent" });
    expect(element.shadowRoot?.querySelectorAll("web-analytics-breakdown-table").length).toBe(5);
  });

  it("keeps the UTM tab hidden until a UTM report is valid", async () => {
    const element = document.createElement("web-analytics-breakdown-grid") as WebAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unknown");
    element.breakdowns = {
      ReferrerHostname: successState({ dimension: "ReferrerHostname", rows: [] }),
    };
    element.events = successState({ rows: [] });
    document.body.append(element);
    await element.updateComplete;

    const table = [...element.shadowRoot?.querySelectorAll("web-analytics-breakdown-table") ?? []]
      .find((candidate) => (candidate as WebAnalyticsBreakdownTableElement).headingTabs?.ariaLabel === "Traffic source") as WebAnalyticsBreakdownTableElement;
    await table.updateComplete;
    expect([...table.shadowRoot?.querySelectorAll<HTMLButtonElement>(".report-tabs.primary [role=tab]") ?? []]
      .map((tab) => tab.textContent?.trim())).toEqual(["Referrers"]);
    expect(table.shadowRoot?.querySelector(".report-tabs.secondary")).toBeNull();
  });

  it("shows event setup guidance when no custom events have been tracked", async () => {
    const element = document.createElement("web-analytics-event-table") as HTMLElement & {
      rows: unknown[];
      updateComplete: Promise<unknown>;
    };
    element.rows = [];
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector(".empty strong")?.textContent).toBe("No events");
    expect(element.shadowRoot?.querySelector(".empty-icon uui-icon")?.getAttribute("name")).toBe("icon-lightning");
    expect(element.shadowRoot?.querySelector(".empty a")).toBeNull();
  });

  it("only offers global event filtering when the provider supports it", async () => {
    const element = document.createElement("web-analytics-event-table") as HTMLElement & {
      rows: Array<{ eventName: string; visitors: number; count: number }>;
      filteringEnabled: boolean;
      updateComplete: Promise<unknown>;
    };
    element.rows = [{ eventName: "Read case", visitors: 12, count: 15 }];
    document.body.append(element);
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector(".filter-action")).toBeNull();
    const metrics = [...element.shadowRoot?.querySelectorAll(".metric-value") ?? []];
    expect(metrics.map((metric) => metric.textContent)).toEqual(["12", "15"]);
    expect(metrics.every((metric) => metric.tagName === "STRONG")).toBe(true);

    element.filteringEnabled = true;
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector(".filter-action")?.getAttribute("aria-label")).toBe("Filter analytics by Read case event");
  });

  it("shows a stable empty state when event properties are unavailable", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: vi.fn(),
    });
    const element = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    element.eventName = "Read article";
    element.propertiesEnabled = true;
    element.details = {
      eventName: "Read article",
      totals: { count: 9, visitors: 7 },
      properties: [],
    };
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector(".analytics-dialog-headline h2 .analytics-dialog-back")?.textContent?.trim()).toBe("Read article");
    expect(element.shadowRoot?.querySelector(".analytics-dialog-close")?.getAttribute("aria-label")).toBe("Close event details");
    expect(element.shadowRoot?.querySelector(".event-totals")).toBeNull();
    expect(element.shadowRoot?.querySelector(".dialog-content")?.classList.contains("no-properties")).toBe(false);
    expect(element.shadowRoot?.querySelector("umb-empty-state")?.getAttribute("headline")).toBe("No property data");
    expect(element.shadowRoot?.querySelector(".no-properties-state")?.textContent).toContain("No custom property values were found");
  });

  it("places event property search above the results table", async () => {
    const element = document.createElement("web-analytics-event-details-dialog") as WebAnalyticsEventDetailsDialogElement;
    element.eventName = "Read article";
    element.propertiesEnabled = true;
    element.details = {
      eventName: "Read article",
      totals: { count: 9, visitors: 7 },
      properties: [{ name: "title", values: [{ value: "Analytics", count: 9, visitors: 7 }] }],
    };
    document.body.append(element);
    await element.updateComplete;

    const search = element.shadowRoot?.querySelector('uui-input[type="search"]');
    expect(search?.parentElement?.classList.contains("property-controls")).toBe(true);
    expect(element.shadowRoot?.querySelector("table uui-input")).toBeNull();
    expect(search?.getAttribute("placeholder")).toBe("Search title");
  });

  it("drills from flag keys into their values and provides setup guidance when empty", async () => {
    const element = document.createElement("web-analytics-flag-card") as WebAnalyticsFlagCardElement;
    element.report = successState({ rows: [{ value: "summer-sale", visitors: 184, pageViews: 841 }] });
    const onSelect = vi.fn();
    element.addEventListener("select-flag", onSelect);
    document.body.append(element);
    await element.updateComplete;

    element.shadowRoot?.querySelector<HTMLButtonElement>(".select")?.click();
    expect((onSelect.mock.calls[0][0] as CustomEvent).detail).toEqual({ flagKey: "summer-sale" });

    element.selected = successState({ flagKey: "summer-sale", rows: [{ value: "true", visitors: 53, pageViews: 200 }] });
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector(".flag-back uui-icon")?.getAttribute("name")).toBe("icon-navigation-left");
    expect(element.shadowRoot?.querySelector(".selected-label")?.textContent).toBe("summer-sale");
    expect(element.shadowRoot?.querySelector(".row .value")?.textContent).toBe("true");
    expect(element.shadowRoot?.querySelector(".row .value")?.tagName).toBe("SPAN");

    element.selected = undefined;
    element.report = successState({ rows: [] });
    await element.updateComplete;
    const setupLink = element.shadowRoot?.querySelector<HTMLAnchorElement>(".empty a");
    expect(element.shadowRoot?.querySelector<HTMLElement>(".empty-icon uui-icon")?.getAttribute("name")).toBe("icon-flag");
    expect(setupLink?.href).toBe("https://vercel.com/docs/flags/observability/web-analytics");
    expect(setupLink?.rel).toBe("noopener noreferrer");
  });

  it("wires a summary interaction through the mounted dashboard controller", async () => {
    const dashboard = document.createElement("web-analytics-dashboard") as WebAnalyticsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => {
      const summary = dashboard.shadowRoot?.querySelector<WebAnalyticsSummaryElement>("web-analytics-summary");
      expect(summary?.report.status).toBe("success");
    });
    const summary = dashboard.shadowRoot?.querySelector<WebAnalyticsSummaryElement>("web-analytics-summary");
    await summary?.updateComplete;

    summary?.shadowRoot?.querySelector<HTMLButtonElement>("#metric-pageViews-tab")?.click();
    await vi.waitFor(() => expect(new URL(window.location.href).searchParams.get("metric")).toBe("pageViews"));

    expect(summary?.metric).toBe("pageViews");
  });

  it("replaces the Events dialog with event details while preserving back navigation", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn() });
    sdk.events.mockResolvedValue(apiOk({ rows: [{ eventName: "Signup completed", visitors: 12, count: 18 }] }));
    sdk.eventDetails.mockResolvedValue(apiOk({
      eventName: "Signup completed",
      totals: { visitors: 12, count: 18 },
      properties: [],
    }));
    const dashboard = document.createElement("web-analytics-dashboard") as WebAnalyticsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector<WebAnalyticsBreakdownGridElement>("web-analytics-breakdown-grid")?.events.status).toBe("success"));

    dashboard.shadowRoot?.querySelector<WebAnalyticsBreakdownGridElement>("web-analytics-breakdown-grid")?.dispatchEvent(new CustomEvent("view-events", { bubbles: true, composed: true }));
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-event-dialog")).not.toBeNull());
    const eventsDialog = dashboard.shadowRoot?.querySelector<HTMLElement>("web-analytics-event-dialog");
    eventsDialog?.dispatchEvent(new CustomEvent("select-event", {
      bubbles: true,
      composed: true,
      detail: { eventName: "Signup completed" },
    }));

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-event-details-dialog")).not.toBeNull());
    expect(dashboard.shadowRoot?.querySelector("web-analytics-event-dialog")).toBeNull();

    dashboard.shadowRoot?.querySelector<HTMLElement>("web-analytics-event-details-dialog")?.dispatchEvent(new CustomEvent("back-to-events", { bubbles: true, composed: true }));
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-event-dialog")).not.toBeNull());
    expect(dashboard.shadowRoot?.querySelector("web-analytics-event-details-dialog")).toBeNull();
  });

  it("clears every active filter from the mounted dashboard and URL", async () => {
    window.history.replaceState({}, "", "/umbraco/section/analytics?filter=RequestPath%3A%2F&filter=Country%3ADK");
    const dashboard = document.createElement("web-analytics-dashboard") as WebAnalyticsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelectorAll(".filter-badge")).toHaveLength(2));

    dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Clear all analytics filters"]')?.click();

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".active-filters")).toBeNull());
    expect(new URL(window.location.href).searchParams.has("filter")).toBe(false);
  });

  it("renders relevant identity icons for active filters", async () => {
    window.history.replaceState({}, "", "/umbraco/section/analytics?filter=Country%3ADK&filter=OsName%3AmacOS&filter=DeviceType%3ADesktop");
    const dashboard = document.createElement("web-analytics-dashboard") as WebAnalyticsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelectorAll(".filter-badge")).toHaveLength(3));

    const badges = [...dashboard.shadowRoot?.querySelectorAll(".filter-badge") ?? []];
    expect((badges[0]?.querySelector(".filter-icon") as HTMLImageElement | null)?.getAttribute("src")).toBe("https://flag.vercel.app/s/DK.svg");
    expect((badges[1]?.querySelector(".filter-icon") as HTMLImageElement | null)?.getAttribute("src")).toBe("/App_Plugins/TheBuilder.WebAnalytics/icons/operating-systems/apple.svg");
    expect(badges[2]?.querySelector(".filter-icon")?.getAttribute("name")).toBe("icon-desktop");
  });
});

function apiOk<T>(data: T) {
  return { data, error: undefined, request: new Request("https://example.com"), response: new Response(null, { status: 200 }) };
}
