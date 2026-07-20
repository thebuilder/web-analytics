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
type BreakdownApi = Pick<ReportApi, "breakdown">;
const maximumConcurrentDashboardReports = 4;
export type DashboardReportUpdate =
  | ({ panel: "summary" } & LoadedReport<AnalyticsSummary>)
  | ({ panel: "events" } & LoadedReport<AnalyticsEventsReport>)
  | ({ panel: "flags" } & LoadedReport<AnalyticsFlagsReport>)
  | ({ panel: "breakdown"; dimension: AnalyticsDimension } & LoadedReport<AnalyticsBreakdown>);
export type DashboardReportEvidence = { baselineSucceeded: boolean; utmSucceeded: boolean; utmStatuses: number[] };
export type LoadedDashboardBreakdown = {
  update: Extract<DashboardReportUpdate, { panel: "breakdown" }>;
  responseStatus?: number;
};

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

  const reports = [
    () => settleRequest(api.summary({ query: visitQuery, signal })).then((result) => {
      const report = toLoadedReport<AnalyticsSummary>(result);
      if (report.status === "success") baselineSucceeded = true;
      publish({ panel: "summary", ...report });
    }),
    () => settleRequest(api.events({ query: { ...eventQuery, limit: 20 }, signal })).then((result) => {
      publish({ panel: "events", ...toLoadedReport<AnalyticsEventsReport>(result) });
    }),
    () => settleRequest(api.flags({ query: { ...visitQuery, limit: 10 }, signal })).then((result) => {
      publish({ panel: "flags", ...toLoadedReport<AnalyticsFlagsReport>(result) });
    }),
    ...dimensions.map((dimension) => async () => {
      const { update, responseStatus } = await loadDashboardBreakdown(visitQuery, dimension, signal, api);
      if (isUtmDimension(dimension)) {
        if (update.status === "success") utmSucceeded = true;
        else if (responseStatus !== undefined) utmStatuses.push(responseStatus);
      } else if (update.status === "success") baselineSucceeded = true;
      publish(update);
    }),
  ];

  await runWithConcurrency(reports, maximumConcurrentDashboardReports);
  return { baselineSucceeded, utmSucceeded, utmStatuses };
}

export async function loadDashboardBreakdown(
  query: DashboardReportQuery,
  dimension: AnalyticsDimension,
  signal: AbortSignal,
  api: BreakdownApi = dashboardApi,
): Promise<LoadedDashboardBreakdown> {
  const result = await settleRequest(api.breakdown({
    path: { dimension }, query: { ...query, limit: 11 }, signal,
  }));
  return {
    update: { panel: "breakdown", dimension, ...toLoadedReport<AnalyticsBreakdown>(result) },
    responseStatus: result.status === "success" ? result.value.response.status : undefined,
  };
}

async function runWithConcurrency(tasks: ReadonlyArray<() => Promise<void>>, maximumConcurrentTasks: number): Promise<void> {
  let nextTask = 0;
  const worker = async () => {
    while (nextTask < tasks.length) {
      const task = tasks[nextTask++];
      await task();
    }
  };

  await Promise.all(Array.from({ length: Math.min(maximumConcurrentTasks, tasks.length) }, worker));
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
