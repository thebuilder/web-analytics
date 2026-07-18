import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ summary: vi.fn(), events: vi.fn(), flags: vi.fn(), breakdown: vi.fn() }));
vi.mock("../api/sdk.gen.js", () => ({ WebAnalyticsService: sdk }));

import { loadDashboardReports, type DashboardReportQuery, type DashboardReportUpdate } from "./dashboard-report-loader.js";

const query = { connection: "main", from: "2026-06-01", to: "2026-06-30", interval: "Day" } as DashboardReportQuery;

describe("loadDashboardReports", () => {
  beforeEach(() => vi.resetAllMocks());

  it("publishes a terminal update for every rejected request", async () => {
    sdk.summary.mockRejectedValue(new Error("offline"));
    sdk.events.mockRejectedValue(new Error("offline"));
    sdk.flags.mockRejectedValue(new Error("offline"));
    sdk.breakdown.mockRejectedValue(new Error("offline"));
    const updates: DashboardReportUpdate[] = [];

    const evidence = await loadDashboardReports(query, query, ["Country", "DeviceType"], new AbortController().signal, (update) => updates.push(update));

    expect(updates).toHaveLength(5);
    expect(updates.every((update) => update.status === "error")).toBe(true);
    expect(evidence.baselineSucceeded).toBe(false);
  });

  it("publishes fast panels without waiting for a slow optional panel", async () => {
    const slow = deferred<ReturnType<typeof ok>>();
    sdk.summary.mockResolvedValue(ok({ totals: { visitors: 1, pageViews: 2 }, points: [] }));
    sdk.events.mockResolvedValue(ok({ rows: [] }));
    sdk.flags.mockResolvedValue(ok({ rows: [] }));
    sdk.breakdown.mockImplementation(({ path }: { path: { dimension: string } }) => path.dimension === "UtmSource" ? slow.promise : Promise.resolve(ok({ rows: [] })));
    const updates: DashboardReportUpdate[] = [];

    const loading = loadDashboardReports(query, query, ["Country", "UtmSource"], new AbortController().signal, (update) => updates.push(update));
    await vi.waitFor(() => expect(updates.some(({ panel }) => panel === "summary")).toBe(true));
    expect(updates.some((update) => update.panel === "breakdown" && update.dimension === "UtmSource")).toBe(false);

    slow.resolve(ok({ rows: [] }));
    await loading;
    expect(updates.some((update) => update.panel === "breakdown" && update.dimension === "UtmSource")).toBe(true);
  });

  it("preserves partial success and separate visit/event filters", async () => {
    sdk.summary.mockResolvedValue(ok({ totals: { visitors: 1, pageViews: 2 }, points: [] }));
    sdk.events.mockResolvedValue(ok({ rows: [] }));
    sdk.flags.mockResolvedValue(ok({ rows: [] }));
    sdk.breakdown.mockResolvedValueOnce(ok({ rows: [{ value: "DK", visitors: 1, pageViews: 2 }] })).mockRejectedValueOnce(new Error("browser unavailable"));
    const visitQuery = { ...query, filter: ["Country:DK"] };
    const eventQuery = { ...query, filter: ["Country:DK", "EventName:Signup"] };
    const updates: DashboardReportUpdate[] = [];

    const evidence = await loadDashboardReports(visitQuery, eventQuery, ["Country", "BrowserName"], new AbortController().signal, (update) => updates.push(update));

    expect(updates.find((update) => update.panel === "summary")?.status).toBe("success");
    expect(updates.find((update) => update.panel === "breakdown" && update.dimension === "Country")?.status).toBe("success");
    expect(updates.find((update) => update.panel === "breakdown" && update.dimension === "BrowserName")?.status).toBe("error");
    expect(evidence.baselineSucceeded).toBe(true);
    expect(sdk.events).toHaveBeenCalledWith(expect.objectContaining({ query: { ...eventQuery, limit: 20 } }));
  });

  it("preserves stable upstream problem codes when adding HTTP status", async () => {
    sdk.summary.mockResolvedValue(problem({ code: "invalid_credentials" }, 502));
    sdk.events.mockResolvedValue(ok({ rows: [] }));
    sdk.flags.mockResolvedValue(ok({ rows: [] }));
    sdk.breakdown.mockResolvedValue(ok({ rows: [] }));
    const updates: DashboardReportUpdate[] = [];

    await loadDashboardReports(query, query, ["Country"], new AbortController().signal, (update) => updates.push(update));

    expect(updates.find((update) => update.panel === "summary")).toMatchObject({ status: "error", error: expect.stringContaining("access token") });
  });

  it("treats a successful response without data as an explicit error", async () => {
    sdk.summary.mockResolvedValue(ok(undefined));
    sdk.events.mockResolvedValue(ok({ rows: [] }));
    sdk.flags.mockResolvedValue(ok({ rows: [] }));
    sdk.breakdown.mockResolvedValue(ok({ rows: [] }));
    const updates: DashboardReportUpdate[] = [];

    await loadDashboardReports(query, query, ["Country"], new AbortController().signal, (update) => updates.push(update));

    expect(updates.find((update) => update.panel === "summary")).toEqual({
      panel: "summary",
      status: "error",
      error: "Analytics returned an empty response.",
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function ok<T>(data: T) {
  return { data, error: undefined, request: new Request("https://example.com"), response: new Response(null, { status: 200 }) };
}

function problem(error: unknown, status: number) {
  return { data: undefined, error, request: new Request("https://example.com"), response: new Response(null, { status }) };
}
