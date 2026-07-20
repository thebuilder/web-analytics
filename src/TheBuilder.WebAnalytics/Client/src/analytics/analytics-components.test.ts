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
import { successState } from "./async-state.js";
import { dashboardCards } from "./dashboard-cards.js";
import type { VercelAnalyticsSummaryElement } from "./analytics-summary.element.js";
import type { VercelAnalyticsBreakdownGridElement } from "./analytics-breakdown-grid.element.js";
import type { VercelAnalyticsBreakdownTableElement } from "./breakdown-table.element.js";
import type { VercelAnalyticsDashboardElement } from "./analytics-dashboard.element.js";
import type { VercelAnalyticsDashboardHeaderElement } from "./analytics-dashboard-header.element.js";
import type { VercelAnalyticsFlagCardElement } from "./flag-card.element.js";
import "./analytics-summary.element.js";
import "./analytics-breakdown-grid.element.js";
import "./analytics-dashboard.element.js";
import "./analytics-dashboard-header.element.js";

beforeEach(() => {
  sdk.connections.mockResolvedValue(apiOk({
    enabled: true,
    defaultRangeDays: 30,
    connections: [{ key: "11111111-1111-1111-1111-111111111111", displayName: "Main", isDefault: true, isConfigured: true, baseUrl: "https://example.com", warnings: [] }],
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
    const element = document.createElement("vercel-analytics-dashboard-header") as VercelAnalyticsDashboardHeaderElement;
    element.documentScoped = true;
    element.range = dateRangeForPreset(30);
    element.siteUrl = "https://example.com";
    element.route = {
      connection: "11111111-1111-1111-1111-111111111111",
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
    expect(favicon?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(element.shadowRoot?.querySelector(".site-mark uui-icon")).toBeNull();

    favicon?.dispatchEvent(new Event("error"));
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector(".site-favicon")).toBeNull();
    expect(element.shadowRoot?.querySelector(".site-mark uui-icon")).not.toBeNull();
  });

  it("directs first-time users to Web Analytics settings", async () => {
    sdk.connections.mockResolvedValue(apiOk({ enabled: true, defaultRangeDays: 30, connections: [] }));
    const element = document.createElement("vercel-analytics-dashboard") as VercelAnalyticsDashboardElement;
    document.body.append(element);

    await vi.waitFor(() => expect(element.shadowRoot?.querySelector("umb-empty-state")?.getAttribute("headline")).toBe("Connect Web Analytics"));

    const action = element.shadowRoot?.querySelector("uui-button");
    expect(action?.getAttribute("href")).toBe("/umbraco/section/settings/dashboard/vercel-analytics");
    expect(action?.getAttribute("label")).toBe("Open Web Analytics settings");
  });

  it("emits metric changes from the summary tabs", async () => {
    const element = document.createElement("vercel-analytics-summary") as VercelAnalyticsSummaryElement;
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
    const element = document.createElement("vercel-analytics-summary") as VercelAnalyticsSummaryElement;
    element.lang = "da-DK";
    element.range = dateRangeForPreset(30);
    element.metric = "visitors";
    element.report = successState({ totals: { visitors: 185_508, pageViews: 34 }, points: [] });
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("#metric-visitors-tab strong")?.textContent).toBe("185.508");
  });

  it("emits audience changes from the breakdown tabs", async () => {
    const element = document.createElement("vercel-analytics-breakdown-grid") as VercelAnalyticsBreakdownGridElement;
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

    const browserTab = [...element.shadowRoot?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? []]
      .find((button) => button.textContent?.trim() === "Browsers");
    browserTab?.click();

    expect(onChange).toHaveBeenCalledOnce();
    expect((onChange.mock.calls[0][0] as CustomEvent).detail).toEqual({ dimension: "BrowserName" });
  });

  it("normalizes percentage cards against all visible grouped rows", async () => {
    const element = document.createElement("vercel-analytics-breakdown-grid") as VercelAnalyticsBreakdownGridElement;
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

    const table = element.shadowRoot?.querySelector<HTMLElement & { total: number }>("vercel-analytics-breakdown-table");
    expect(table?.total).toBe(11_339);
  });

  it("renders referrers as secure external links with favicons for attributed hosts", async () => {
    const element = document.createElement("vercel-analytics-breakdown-table") as VercelAnalyticsBreakdownTableElement;
    element.dimension = "ReferrerHostname";
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
    expect(element.shadowRoot?.querySelector(".metric-number")?.textContent).toBe("22,304");
  });

  it("places events beside referrers in document analytics", async () => {
    const element = document.createElement("vercel-analytics-breakdown-grid") as VercelAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(true, "unavailable");
    element.events = successState({ rows: [{ eventName: "Signup", visitors: 12, count: 18 }] });
    document.body.append(element);
    await element.updateComplete;

    const cards = [...element.shadowRoot?.querySelectorAll("uui-box") ?? []];
    expect(cards[0]?.querySelector<HTMLElement & { headline: string }>("vercel-analytics-breakdown-table")?.headline).toBe("Referrers");
    expect(cards[1]?.querySelector("vercel-analytics-event-table")).not.toBeNull();
  });

  it("gives Flags the same wide span as Events in the overview", async () => {
    const element = document.createElement("vercel-analytics-breakdown-grid") as VercelAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unavailable");
    element.events = successState({ rows: [] });
    document.body.append(element);
    await element.updateComplete;

    const cards = [...element.shadowRoot?.querySelectorAll("uui-box") ?? []];
    const flagsCard = cards[cards.length - 1];
    expect(flagsCard?.querySelector("vercel-analytics-flag-card")).not.toBeNull();
    expect(flagsCard?.classList.contains("flags-card")).toBe(true);
    expect(flagsCard?.classList.contains("wide")).toBe(true);
    expect(cards[cards.length - 2]?.querySelector("vercel-analytics-event-table")).not.toBeNull();
  });

  it("keeps Flags on its own row in document analytics", async () => {
    const element = document.createElement("vercel-analytics-breakdown-grid") as VercelAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(true, "unavailable");
    element.events = successState({ rows: [] });
    document.body.append(element);
    await element.updateComplete;

    const cards = [...element.shadowRoot?.querySelectorAll("uui-box") ?? []];
    const flagsCard = cards[cards.length - 1];
    expect(flagsCard?.classList.contains("document-flags-card")).toBe(true);
    expect(flagsCard?.classList.contains("wide")).toBe(false);
  });

  it("merges valid UTM reports into the referrers card with five parameter tabs", async () => {
    const element = document.createElement("vercel-analytics-breakdown-grid") as VercelAnalyticsBreakdownGridElement;
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

    const topTabs = [...element.shadowRoot?.querySelectorAll<HTMLButtonElement>(".acquisition-tabs [role=tab]") ?? []];
    expect(topTabs.map((tab) => tab.textContent?.trim())).toEqual(["Referrers", "UTM Parameters"]);
    topTabs[1]?.click();
    expect((onAcquisitionChange.mock.calls[0][0] as CustomEvent).detail).toEqual({ view: "utm" });
    element.acquisitionView = "utm";
    await element.updateComplete;

    const parameterTabs = [...element.shadowRoot?.querySelectorAll<HTMLButtonElement>(".utm-tabs [role=tab]") ?? []];
    expect(parameterTabs.map((tab) => tab.textContent?.trim())).toEqual(["Source", "Medium", "Campaign", "Term", "Content"]);
    const acquisitionTable = [...element.shadowRoot?.querySelectorAll("vercel-analytics-breakdown-table") ?? []]
      .find((table) => table.querySelector(".utm-tabs")) as VercelAnalyticsBreakdownTableElement;
    await acquisitionTable.updateComplete;
    const headerRows = acquisitionTable.shadowRoot?.querySelectorAll("thead tr");
    expect(headerRows?.[0].lastElementChild?.textContent?.trim()).toBe("Visitors");
    expect(headerRows?.[0].lastElementChild?.hasAttribute("rowspan")).toBe(false);
    expect(headerRows?.[1].firstElementChild?.getAttribute("colspan")).toBe("2");
    parameterTabs[4]?.click();
    expect((onChange.mock.calls[0][0] as CustomEvent).detail).toEqual({ dimension: "UtmContent" });
    expect(element.shadowRoot?.querySelectorAll("vercel-analytics-breakdown-table").length).toBe(5);
  });

  it("keeps the UTM tab hidden until a UTM report is valid", async () => {
    const element = document.createElement("vercel-analytics-breakdown-grid") as VercelAnalyticsBreakdownGridElement;
    element.cards = dashboardCards(false, "unknown");
    element.breakdowns = {
      ReferrerHostname: successState({ dimension: "ReferrerHostname", rows: [] }),
    };
    element.events = successState({ rows: [] });
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector(".acquisition-tabs")?.textContent?.trim()).toBe("Referrers");
    expect(element.shadowRoot?.querySelector(".utm-tabs")).toBeNull();
  });

  it("shows event setup guidance when no custom events have been tracked", async () => {
    const element = document.createElement("vercel-analytics-event-table") as HTMLElement & {
      rows: unknown[];
      updateComplete: Promise<unknown>;
    };
    element.rows = [];
    document.body.append(element);
    await element.updateComplete;

    const setupLink = element.shadowRoot?.querySelector<HTMLAnchorElement>(".empty a");
    expect(element.shadowRoot?.querySelector(".empty strong")?.textContent).toBe("No events");
    expect(element.shadowRoot?.querySelector(".empty-icon uui-icon")?.getAttribute("name")).toBe("icon-lightning");
    expect(setupLink?.href).toBe("https://vercel.com/docs/analytics/custom-events");
    expect(setupLink?.rel).toBe("noopener noreferrer");
  });

  it("drills from flag keys into their values and provides setup guidance when empty", async () => {
    const element = document.createElement("vercel-analytics-flag-card") as VercelAnalyticsFlagCardElement;
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

    element.selected = undefined;
    element.report = successState({ rows: [] });
    await element.updateComplete;
    const setupLink = element.shadowRoot?.querySelector<HTMLAnchorElement>(".empty a");
    expect(element.shadowRoot?.querySelector<HTMLElement>(".empty-icon uui-icon")?.getAttribute("name")).toBe("icon-flag");
    expect(setupLink?.href).toBe("https://vercel.com/docs/flags/observability/web-analytics");
    expect(setupLink?.rel).toBe("noopener noreferrer");
  });

  it("wires a summary interaction through the mounted dashboard controller", async () => {
    const dashboard = document.createElement("vercel-analytics-dashboard") as VercelAnalyticsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => {
      const summary = dashboard.shadowRoot?.querySelector<VercelAnalyticsSummaryElement>("vercel-analytics-summary");
      expect(summary?.report.status).toBe("success");
    });
    const summary = dashboard.shadowRoot?.querySelector<VercelAnalyticsSummaryElement>("vercel-analytics-summary");
    await summary?.updateComplete;

    summary?.shadowRoot?.querySelector<HTMLButtonElement>("#metric-pageViews-tab")?.click();
    await vi.waitFor(() => expect(new URL(window.location.href).searchParams.get("metric")).toBe("pageViews"));

    expect(summary?.metric).toBe("pageViews");
  });

  it("clears every active filter from the mounted dashboard and URL", async () => {
    window.history.replaceState({}, "", "/umbraco/section/analytics?filter=RequestPath%3A%2F&filter=Country%3ADK");
    const dashboard = document.createElement("vercel-analytics-dashboard") as VercelAnalyticsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelectorAll(".filter-badge")).toHaveLength(2));

    dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Clear all analytics filters"]')?.click();

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".active-filters")).toBeNull());
    expect(new URL(window.location.href).searchParams.has("filter")).toBe(false);
  });
});

function apiOk<T>(data: T) {
  return { data, error: undefined, request: new Request("https://example.com"), response: new Response(null, { status: 200 }) };
}
