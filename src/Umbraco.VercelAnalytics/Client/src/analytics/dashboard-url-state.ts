import type { AnalyticsDimension } from "../api/types.gen.js";
import { normalizeCustomRange, type AnalyticsDateRange, type DatePreset } from "./date-range.js";

export type AnalyticsFilter = { dimension: AnalyticsDimension; value: string };
export type DashboardMetric = "visitors" | "pageViews";
export type AudienceDimension = "DeviceType" | "BrowserName";
export type UtmDimension = "UtmSource" | "UtmMedium" | "UtmCampaign" | "UtmTerm" | "UtmContent";

export type DashboardUrlState = {
  connection?: string;
  preset?: DatePreset;
  range?: AnalyticsDateRange;
  metric: DashboardMetric;
  audience: AudienceDimension;
  utm: UtmDimension;
  filters: AnalyticsFilter[];
};

const DIMENSIONS = new Set<AnalyticsDimension>([
  "RequestPath", "Route", "ReferrerHostname", "Country", "DeviceType",
  "BrowserName", "OsName", "UtmSource", "UtmMedium", "UtmCampaign", "UtmTerm", "UtmContent", "EventName",
]);
const PRESETS = new Set([1, 7, 30, 90, 365]);

export function serializeFilter(filter: AnalyticsFilter): string {
  return `${filter.dimension}:${filter.value}`;
}

export function parseDashboardUrlState(params: URLSearchParams): DashboardUrlState {
  const rawPreset = params.get("range");
  const numericPreset = Number(rawPreset);
  const preset: DatePreset | undefined = rawPreset === "custom"
    ? "custom"
    : PRESETS.has(numericPreset) ? numericPreset as Exclude<DatePreset, "custom"> : undefined;
  const range = normalizeCustomRange(
    params.get("from") ?? "",
    params.get("to") ?? "",
    params.get("tz") || undefined,
  );
  const filters: AnalyticsFilter[] = [];
  const seen = new Set<AnalyticsDimension>();
  for (const raw of params.getAll("filter").slice(0, 10)) {
    const separator = raw.indexOf(":");
    const dimension = raw.slice(0, separator) as AnalyticsDimension;
    const value = raw.slice(separator + 1).trim();
    if (separator <= 0 || !DIMENSIONS.has(dimension) || !value || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value) || seen.has(dimension)) continue;
    seen.add(dimension);
    filters.push({ dimension, value });
  }

  return {
    connection: params.get("connection") || undefined,
    preset,
    range,
    metric: params.get("metric") === "pageViews" ? "pageViews" : "visitors",
    audience: params.get("audience") === "BrowserName" ? "BrowserName" : "DeviceType",
    utm: parseUtmDimension(params.get("utm")),
    filters,
  };
}

function parseUtmDimension(value: string | null): UtmDimension {
  return value === "UtmMedium" || value === "UtmCampaign" || value === "UtmTerm" || value === "UtmContent"
    ? value
    : "UtmSource";
}

export function writeDashboardUrlState(url: URL, state: Required<Pick<DashboardUrlState, "preset" | "range" | "metric" | "audience" | "utm" | "filters">> & { connection?: string }): URL {
  const params = url.searchParams;
  for (const name of ["connection", "range", "from", "to", "tz", "metric", "audience", "utm", "filter"]) params.delete(name);
  if (state.connection) params.set("connection", state.connection);
  params.set("range", String(state.preset));
  params.set("from", state.range.from);
  params.set("to", state.range.to);
  params.set("tz", state.range.timeZone);
  params.set("metric", state.metric);
  params.set("audience", state.audience);
  params.set("utm", state.utm);
  state.filters.forEach((filter) => params.append("filter", serializeFilter(filter)));
  return url;
}
