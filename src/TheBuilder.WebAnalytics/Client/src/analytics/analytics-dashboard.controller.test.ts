import { describe, expect, it, vi } from "vitest";
import type { AnalyticsDocumentRoute } from "../api/types.gen.js";
import { AnalyticsDashboardController, type DashboardEnvironment } from "./analytics-dashboard.controller.js";
import type { DashboardApi } from "./dashboard-api.js";
import { dateRangeForPreset } from "./date-range.js";

describe("AnalyticsDashboardController", () => {
  it("uses the first connection when no requested or stored connection is valid", async () => {
    const api = dashboardApi();
    api.connections.mockResolvedValue(ok({
      enabled: true,
      defaultRangeDays: 30,
      connections: [
        { key: "11111111-1111-1111-1111-111111111111", displayName: "First", isDefault: true, isConfigured: true, baseUrl: "https://first.example.com", warnings: [] },
        { key: "22222222-2222-2222-2222-222222222222", displayName: "Second", isDefault: false, isConfigured: true, baseUrl: "https://second.example.com", warnings: [] },
      ],
    }));
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());

    controller.connect();

    await vi.waitFor(() => expect(controller.state.summary.status).toBe("success"));
    expect(controller.state.connection).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("keeps the newest document scope when an older route request finishes last", async () => {
    const first = deferred<ReturnType<typeof ok<AnalyticsDocumentRoute[]>>>();
    const second = deferred<ReturnType<typeof ok<AnalyticsDocumentRoute[]>>>();
    const api = dashboardApi();
    api.documentRoutes.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());

    controller.connect("first", "en-US");
    controller.setScope("second", "da-DK");
    second.resolve(ok([route("/new", "da-DK")]));
    await vi.waitFor(() => expect(controller.state.route?.path).toBe("/new"));

    first.resolve(ok([route("/old", "en-US")]));
    await Promise.resolve();
    expect(controller.state.route?.path).toBe("/new");
    expect(controller.state.summary.status).toBe("success");
  });

  it("does not restore a breakdown after its dialog closes during a request", async () => {
    const api = dashboardApi();
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());
    controller.connect();
    await vi.waitFor(() => expect(controller.state.summary.status).toBe("success"));
    const pending = deferred<ReturnType<typeof ok<{ dimension: "Country"; rows: never[] }>>>();
    api.breakdown.mockReturnValueOnce(pending.promise);

    const opening = controller.openBreakdown("Country", "Countries");
    expect(controller.state.expandedBreakdown?.report.status).toBe("loading");
    controller.closeBreakdown();
    pending.resolve(ok({ dimension: "Country", rows: [] }));
    await opening;

    expect(controller.state.expandedBreakdown).toBeUndefined();
  });

  it("does not restore event details after the dialog closes during a request", async () => {
    const api = dashboardApi();
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());
    controller.connect();
    await vi.waitFor(() => expect(controller.state.summary.status).toBe("success"));
    const pending = deferred<ReturnType<typeof ok<{ eventName: string; totals: { count: number; visitors: number }; properties: never[] }>>>();
    api.eventDetails.mockReturnValueOnce(pending.promise);

    const selecting = controller.selectEvent("Signup");
    expect(controller.state.selectedEvent?.details.status).toBe("loading");
    controller.closeEventDetails();
    pending.resolve(ok({ eventName: "Signup", totals: { count: 1, visitors: 1 }, properties: [] }));
    await selecting;

    expect(controller.state.selectedEvent).toBeUndefined();
  });

  it("atomically clears document and dialog state when scope changes", async () => {
    const api = dashboardApi();
    api.documentRoutes.mockResolvedValue(ok([route("/old", "en-US")]));
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());
    controller.connect("old", "en-US");
    await vi.waitFor(() => expect(controller.state.route?.path).toBe("/old"));
    const pending = deferred<ReturnType<typeof ok<{ dimension: "Country"; rows: never[] }>>>();
    api.breakdown.mockReturnValueOnce(pending.promise);
    void controller.openBreakdown("Country", "Countries");

    controller.setScope();

    expect(controller.state.route).toBeUndefined();
    expect(controller.state.expandedBreakdown).toBeUndefined();
    expect(controller.state.summary.status).toBe("loading");
    pending.resolve(ok({ dimension: "Country", rows: [] }));
    await vi.waitFor(() => expect(controller.state.summary.status).toBe("success"));
    expect(controller.state.route).toBeUndefined();
    expect(controller.linkBaseUrl()).toBe("https://example.com");
  });

  it("commits independent panels before a slow summary finishes", async () => {
    const api = dashboardApi();
    const summary = deferred<ReturnType<typeof ok<{ totals: { visitors: number; pageViews: number }; points: never[] }>>>();
    api.summary.mockReturnValueOnce(summary.promise);
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());

    controller.connect();
    await vi.waitFor(() => expect(controller.state.events.status).toBe("success"));
    expect(controller.state.summary.status).toBe("loading");

    summary.resolve(ok({ totals: { visitors: 10, pageViews: 20 }, points: [] }));
    await vi.waitFor(() => expect(controller.state.summary.status).toBe("success"));
  });

  it("ignores an older report generation that finishes after the latest one", async () => {
    const api = dashboardApi();
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());
    controller.connect();
    await vi.waitFor(() => expect(controller.state.summary.status).toBe("success"));
    const old = deferred<ReturnType<typeof ok<{ totals: { visitors: number; pageViews: number }; points: never[] }>>>();
    api.summary.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok({ totals: { visitors: 99, pageViews: 100 }, points: [] }));

    controller.setDateRange(7, dateRangeForPreset(7));
    controller.setDateRange(90, dateRangeForPreset(90));
    await vi.waitFor(() => expect(controller.state.summary.status === "success" && controller.state.summary.data.totals.visitors).toBe(99));
    old.resolve(ok({ totals: { visitors: 1, pageViews: 2 }, points: [] }));
    await Promise.resolve();

    expect(controller.state.summary.status === "success" && controller.state.summary.data.totals.visitors).toBe(99);
  });

  it("queries the API with hourly granularity for the last 24 hours", async () => {
    const api = dashboardApi();
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());
    controller.connect();
    await vi.waitFor(() => expect(controller.state.summary.status).toBe("success"));
    api.summary.mockClear();

    controller.setDateRange(1, dateRangeForPreset(1, new Date("2026-07-17T12:00:00Z"), "Europe/Copenhagen"));
    await vi.waitFor(() => expect(api.summary).toHaveBeenCalled());

    expect(api.summary.mock.calls[0]?.[0]?.query).toEqual(expect.objectContaining({
      from: "2026-07-16T12:00:00.000Z",
      to: "2026-07-17T12:00:00.000Z",
      interval: "Hour",
    }));
  });

  it("writes user actions to the shareable URL", () => {
    const api = dashboardApi();
    const target = environment();
    const controller = new AnalyticsDashboardController(vi.fn(), api, target);
    controller.connect();

    controller.setMetric("pageViews");
    controller.setAudienceDimension("BrowserName");

    expect(target.currentUrl().searchParams.get("metric")).toBe("pageViews");
    expect(target.currentUrl().searchParams.get("audience")).toBe("BrowserName");
  });

  it("requires setup before loading reports when no connection exists", async () => {
    const api = dashboardApi();
    api.connections.mockResolvedValue(ok({ enabled: true, defaultRangeDays: 30, connections: [] }));
    const controller = new AnalyticsDashboardController(vi.fn(), api, environment());

    controller.connect();

    await vi.waitFor(() => expect(controller.state.setupRequired).toBe(true));
    expect(api.summary).not.toHaveBeenCalled();
  });

});

function dashboardApi() {
  return {
    connections: vi.fn<DashboardApi["connections"]>(async () => ok({
      enabled: true,
      defaultRangeDays: 30,
      connections: [{ key: "11111111-1111-1111-1111-111111111111", displayName: "Main", isDefault: true, isConfigured: true, baseUrl: "https://example.com", warnings: [] }],
    })),
    documentRoutes: vi.fn<DashboardApi["documentRoutes"]>(async () => ok([])),
    summary: vi.fn<DashboardApi["summary"]>(async () => ok({ totals: { visitors: 10, pageViews: 20 }, points: [] })),
    events: vi.fn<DashboardApi["events"]>(async () => ok({ rows: [] })),
    flags: vi.fn<DashboardApi["flags"]>(async () => ok({ rows: [] })),
    breakdown: vi.fn<DashboardApi["breakdown"]>(async ({ path }) => ok({ dimension: path.dimension, rows: [] })),
    eventDetails: vi.fn<DashboardApi["eventDetails"]>(async () => ok({ eventName: "Event", totals: { count: 0, visitors: 0 }, properties: [] })),
    eventPropertyValues: vi.fn<DashboardApi["eventPropertyValues"]>(async () => ok({ name: "property", values: [] })),
  } satisfies DashboardApi;
}

function route(path: string, culture: string): AnalyticsDocumentRoute {
  return { connection: "11111111-1111-1111-1111-111111111111", culture, hostname: "example.com", path, url: `https://example.com${path}`, isCurrent: true, warnings: [] };
}

function environment(): DashboardEnvironment {
  let url = new URL("https://cms.example.com/umbraco/section/analytics");
  return {
    currentUrl: () => new URL(url),
    replaceUrl: (next) => { url = new URL(next); },
    getStoredConnection: () => null,
    setStoredConnection: vi.fn(),
    languages: ["en-US"],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function ok<T>(data: T) {
  return { data, error: undefined, request: new Request("https://example.com"), response: new Response(null, { status: 200 }) };
}
