import type { AnalyticsBreakdown, AnalyticsDimension, AnalyticsEventsReport, AnalyticsFlagsReport, AnalyticsSummary } from "../api/types.gen.js";
import { dashboardApi, type DashboardApi } from "./dashboard-api.js";
import { reportErrorMessage } from "./report-error.js";
import { settleRequest, type SettledRequestResult } from "./request-coordinator.js";
import { isUtmDimension } from "./utm-capability.js";

type SummaryOptions = NonNullable<Parameters<DashboardApi["summary"]>[0]>;
export type DashboardReportQuery = NonNullable<SummaryOptions["query"]>;
type LoadedReport<T> = { status: "success"; data: T } | { status: "error"; error: string };
type SdkResult<T> = { data?: T; error?: unknown; response: Response };
type ReportApi = Pick<DashboardApi, "summary" | "events" | "flags" | "breakdown">;
export type DashboardReportUpdate =
  | ({ panel: "summary" } & LoadedReport<AnalyticsSummary>)
  | ({ panel: "events" } & LoadedReport<AnalyticsEventsReport>)
  | ({ panel: "flags" } & LoadedReport<AnalyticsFlagsReport>)
  | ({ panel: "breakdown"; dimension: AnalyticsDimension } & LoadedReport<AnalyticsBreakdown>);
export type DashboardReportEvidence = { baselineSucceeded: boolean; utmSucceeded: boolean; utmStatuses: number[] };

export async function loadDashboardReports(
  visitQuery: DashboardReportQuery,
  eventQuery: DashboardReportQuery,
  dimensions: ReadonlyArray<AnalyticsDimension>,
  signal: AbortSignal,
  onUpdate: (update: DashboardReportUpdate) => void,
  api: ReportApi = dashboardApi,
): Promise<DashboardReportEvidence> {
  let baselineSucceeded = false;
  let utmSucceeded = false;
  const utmStatuses: number[] = [];
  const publish = (update: DashboardReportUpdate) => { if (!signal.aborted) onUpdate(update); };

  const summary = settleRequest(api.summary({ query: visitQuery, signal })).then((result) => {
    const report = toLoadedReport<AnalyticsSummary>(result);
    if (report.status === "success") baselineSucceeded = true;
    publish({ panel: "summary", ...report });
  });
  const events = settleRequest(api.events({ query: { ...eventQuery, limit: 20 }, signal })).then((result) => {
    publish({ panel: "events", ...toLoadedReport<AnalyticsEventsReport>(result) });
  });
  const flags = settleRequest(api.flags({ query: { ...visitQuery, limit: 10 }, signal })).then((result) => {
    publish({ panel: "flags", ...toLoadedReport<AnalyticsFlagsReport>(result) });
  });
  const breakdowns = dimensions.map((dimension) => settleRequest(api.breakdown({
    path: { dimension }, query: { ...visitQuery, limit: 11 }, signal,
  })).then((result) => {
    const report = toLoadedReport<AnalyticsBreakdown>(result);
    if (isUtmDimension(dimension)) {
      if (report.status === "success") utmSucceeded = true;
      else if (result.status === "success" && result.value.error) utmStatuses.push(result.value.response.status);
    } else if (report.status === "success") baselineSucceeded = true;
    publish({ panel: "breakdown", dimension, ...report });
  }));

  await Promise.all([summary, events, flags, ...breakdowns]);
  return { baselineSucceeded, utmSucceeded, utmStatuses };
}

function toLoadedReport<T>(result: SettledRequestResult<SdkResult<T>>): LoadedReport<T> {
  if (result.status === "error") return { status: "error", error: reportErrorMessage(result.error) };
  const { data, error, response } = result.value;
  if (error) return { status: "error", error: reportErrorMessage(withStatus(error, response.status)) };
  return data == null
    ? { status: "error", error: "Analytics returned an empty response." }
    : { status: "success", data };
}

function withStatus(error: unknown, status: number): unknown {
  return typeof error === "object" && error !== null ? { ...error, status } : { status };
}
