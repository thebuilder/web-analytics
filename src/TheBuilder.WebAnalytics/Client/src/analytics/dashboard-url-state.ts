import type { AnalyticsDimension } from "../api/types.gen.js";
import { normalizeCustomRange, normalizePresetRange, type AnalyticsDateRange, type DatePreset } from "./date-range.js";

export type AnalyticsFilter = { dimension: AnalyticsDimension; value: string };
export type AnalyticsFlagFilter = { flagKey: string; value: string };
export type AnalyticsEventFilter = { eventName: string; property: string; value: string };
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
  flagFilter?: AnalyticsFlagFilter;
  eventFilter?: AnalyticsEventFilter;
};

const DIMENSIONS = new Set<AnalyticsDimension>([
  "RequestPath", "Route", "ReferrerHostname", "Referrer", "Country", "DeviceType",
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
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const timeZone = params.get("tz") || undefined;
  const range = preset && preset !== "custom"
    ? normalizePresetRange(preset, from, to, timeZone)
    : normalizeCustomRange(from, to, timeZone);
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
  const filterFlagKey = validFilterValue(params.get("filterFlagKey"), 255, false);
  const filterFlagValue = validFilterValue(params.get("filterFlagValue"), 500, true);
  const flagFilter = filterFlagKey && filterFlagValue !== undefined
    ? { flagKey: filterFlagKey, value: filterFlagValue }
    : undefined;
  const filterEventName = validFilterValue(params.get("filterEventName"), 255, false);
  const filterEventProperty = validFilterValue(params.get("filterEventProperty"), 255, false);
  const filterEventValue = validFilterValue(params.get("filterEventValue"), 500, true);
  const eventFilter = filterEventName && filterEventProperty && filterEventValue !== undefined
    ? { eventName: filterEventName, property: filterEventProperty, value: filterEventValue }
    : undefined;

  return {
    connection: params.get("connection") || undefined,
    preset,
    range,
    metric: params.get("metric") === "pageViews" ? "pageViews" : "visitors",
    audience: params.get("audience") === "BrowserName" ? "BrowserName" : "DeviceType",
    utm: parseUtmDimension(params.get("utm")),
    filters,
    flagFilter,
    eventFilter,
  };
}

function validFilterValue(value: string | null, maximumLength: number, allowEmpty: boolean): string | undefined {
  return value !== null
    && (allowEmpty || value.length > 0)
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : undefined;
}

function parseUtmDimension(value: string | null): UtmDimension {
  return value === "UtmMedium" || value === "UtmCampaign" || value === "UtmTerm" || value === "UtmContent"
    ? value
    : "UtmSource";
}

export function writeDashboardUrlState(url: URL, state: Required<Pick<DashboardUrlState, "preset" | "range" | "metric" | "audience" | "utm" | "filters">> & Pick<DashboardUrlState, "connection" | "flagFilter" | "eventFilter">): URL {
  const params = url.searchParams;
  for (const name of ["connection", "range", "from", "to", "tz", "metric", "audience", "utm", "filter", "filterFlagKey", "filterFlagValue", "filterEventName", "filterEventProperty", "filterEventValue"]) params.delete(name);
  if (state.connection) params.set("connection", state.connection);
  params.set("range", String(state.preset));
  params.set("from", state.range.from);
  params.set("to", state.range.to);
  params.set("tz", state.range.timeZone);
  params.set("metric", state.metric);
  params.set("audience", state.audience);
  params.set("utm", state.utm);
  state.filters.forEach((filter) => params.append("filter", serializeFilter(filter)));
  if (state.flagFilter) {
    params.set("filterFlagKey", state.flagFilter.flagKey);
    params.set("filterFlagValue", state.flagFilter.value);
  }
  if (state.eventFilter) {
    params.set("filterEventName", state.eventFilter.eventName);
    params.set("filterEventProperty", state.eventFilter.property);
    params.set("filterEventValue", state.eventFilter.value);
  }
  return url;
}
