import { describe, expect, it } from "vitest";
import { parseDashboardUrlState, writeDashboardUrlState } from "./dashboard-url-state.js";

describe("analytics dashboard URL state", () => {
  it("parses shareable report state and ignores malformed filters", () => {
    const state = parseDashboardUrlState(new URLSearchParams(
      "connection=main&range=30&from=2026-06-17T00%3A00%3A00Z&to=2026-07-16T00%3A00%3A00Z&tz=UTC&metric=pageViews&audience=BrowserName&utm=UtmCampaign&filter=Country%3ADK&filter=RequestPath%3A%2Fnews%3Aarchive&filter=EventName%3ASignup&filter=Nope%3Ax&filter=Country%3AUS",
    ));

    expect(state.connection).toBe("main");
    expect(state.preset).toBe(30);
    expect(state.range).toEqual({ from: "2026-06-17T00:00:00.000Z", to: "2026-07-16T00:00:00.000Z", interval: "Day", timeZone: "UTC" });
    expect(state.metric).toBe("pageViews");
    expect(state.audience).toBe("BrowserName");
    expect(state.utm).toBe("UtmCampaign");
    expect(state.filters).toEqual([
      { dimension: "Country", value: "DK" },
      { dimension: "RequestPath", value: "/news:archive" },
      { dimension: "EventName", value: "Signup" },
    ]);
  });

  it("writes analytics state while preserving unrelated Umbraco parameters", () => {
    const url = writeDashboardUrlState(new URL("https://example.com/umbraco/section/analytics?umbDebug=true&filter=Country%3AUS"), {
      connection: "main",
      preset: "custom",
      range: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T00:00:00.000Z", interval: "Day", timeZone: "Europe/Copenhagen" },
      metric: "visitors",
      audience: "DeviceType",
      utm: "UtmMedium",
      filters: [{ dimension: "Country", value: "DK" }],
    });

    expect(url.searchParams.get("umbDebug")).toBe("true");
    expect(url.searchParams.get("range")).toBe("custom");
    expect(url.searchParams.get("utm")).toBe("UtmMedium");
    expect(url.searchParams.get("tz")).toBe("Europe/Copenhagen");
    expect(url.searchParams.getAll("filter")).toEqual(["Country:DK"]);
  });

  it("restores the hourly last 24 hours preset", () => {
    const state = parseDashboardUrlState(new URLSearchParams(
      "range=1&from=2026-07-16T12%3A00%3A00Z&to=2026-07-17T12%3A00%3A00Z&tz=Europe%2FCopenhagen",
    ));

    expect(state.preset).toBe(1);
    expect(state.range).toEqual({
      from: "2026-07-16T12:00:00.000Z",
      to: "2026-07-17T12:00:00.000Z",
      interval: "Hour",
      timeZone: "Europe/Copenhagen",
    });
  });

  it("preserves a rolling seven day URL while restoring daily granularity", () => {
    const state = parseDashboardUrlState(new URLSearchParams(
      "range=7&from=2026-07-06T13%3A00%3A00.001Z&to=2026-07-13T14%3A00%3A00.000Z&tz=Europe%2FCopenhagen",
    ));

    expect(state.range).toEqual({
      from: "2026-07-06T13:00:00.001Z",
      to: "2026-07-13T14:00:00.000Z",
      interval: "Day",
      timeZone: "Europe/Copenhagen",
    });
  });

  it("restores supported granularity for long preset URLs", () => {
    const ninetyDays = parseDashboardUrlState(new URLSearchParams(
      "range=90&from=2026-04-21T16%3A00%3A00Z&to=2026-07-20T17%3A00%3A00Z&tz=Europe%2FCopenhagen",
    ));
    const twelveMonths = parseDashboardUrlState(new URLSearchParams(
      "range=365&from=2025-07-20T16%3A00%3A00Z&to=2026-07-20T17%3A00%3A00Z&tz=Europe%2FCopenhagen",
    ));

    expect(ninetyDays.range?.interval).toBe("Week");
    expect(twelveMonths.range?.interval).toBe("Month");
  });

  it("ignores a preset range with an invalid timezone", () => {
    const state = parseDashboardUrlState(new URLSearchParams(
      "range=7&from=2026-07-06T13%3A00%3A00Z&to=2026-07-13T14%3A00%3A00Z&tz=Not%2FA_Timezone",
    ));

    expect(state.preset).toBe(7);
    expect(state.range).toBeUndefined();
  });

  it("defaults invalid UTM tabs to source", () => {
    expect(parseDashboardUrlState(new URLSearchParams("utm=Nope")).utm).toBe("UtmSource");
  });

  it("restores term and content UTM tabs", () => {
    expect(parseDashboardUrlState(new URLSearchParams("utm=UtmTerm")).utm).toBe("UtmTerm");
    expect(parseDashboardUrlState(new URLSearchParams("utm=UtmContent")).utm).toBe("UtmContent");
  });
});
