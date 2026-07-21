import type { AnalyticsBreakdown, AnalyticsDimension, AnalyticsEventsReport, AnalyticsFlagsReport, AnalyticsSummary } from "../api/types.gen.js";
import { dashboardApi, type DashboardApi } from "./dashboard-api.js";
import { reportErrorMessage } from "./report-error.js";
import { settleRequest, type SettledRequestResult } from "./request-coordinator.js";
import { isUtmDimension } from "./utm-capability.js";
import type { DashboardMetric } from "./dashboard-url-state.js";

type SummaryOptions = NonNullable<Parameters<DashboardApi["summary"]>[0]>;
export type DashboardReportQuery = NonNullable<SummaryOptions["query"]>;
type LoadedReport<T> = { status: "success"; data: T } | { status: "error"; error: string };
type SdkResult<T> = { data?: T; error?: unknown; response?: Response };
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

export async function loadDashboardBreakdowns(
  query: DashboardReportQuery,
  dimensions: ReadonlyArray<AnalyticsDimension>,
  signal: AbortSignal,
  onUpdate: (update: Extract<DashboardReportUpdate, { panel: "breakdown" }>) => void,
  api: BreakdownApi = dashboardApi,
  metric: DashboardMetric = "visitors",
  breakdownOrdering = true,
): Promise<void> {
  const publish = (update: Extract<DashboardReportUpdate, { panel: "breakdown" }>) => {
    if (!signal.aborted) onUpdate(update);
  };
  await runWithConcurrency(
    createBreakdownTasks(query, dimensions, signal, api, metric, breakdownOrdering, ({ update }) => publish(update)),
    maximumConcurrentDashboardReports,
  );
}

export async function loadDashboardReports(
  visitQuery: DashboardReportQuery,
  eventQuery: DashboardReportQuery,
  dimensions: ReadonlyArray<AnalyticsDimension>,
  signal: AbortSignal,
  onUpdate: (update: DashboardReportUpdate) => void,
  api: ReportApi = dashboardApi,
  capabilities: { events: boolean; flags: boolean; breakdownOrdering: boolean } = { events: true, flags: true, breakdownOrdering: true },
  metric: DashboardMetric = "visitors",
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
    ...(capabilities.events ? [() => settleRequest(api.events({ query: { ...eventQuery, limit: 20 }, signal })).then((result) => {
      publish({ panel: "events", ...toLoadedReport<AnalyticsEventsReport>(result) });
    })] : []),
    ...(capabilities.flags ? [() => settleRequest(api.flags({ query: { ...visitQuery, limit: 10 }, signal })).then((result) => {
      publish({ panel: "flags", ...toLoadedReport<AnalyticsFlagsReport>(result) });
    })] : []),
    ...createBreakdownTasks(visitQuery, dimensions, signal, api, metric, capabilities.breakdownOrdering, ({ update, responseStatus }) => {
      if (isUtmDimension(update.dimension)) {
        if (update.status === "success") utmSucceeded = true;
        else if (responseStatus !== undefined) utmStatuses.push(responseStatus);
      } else if (update.status === "success") baselineSucceeded = true;
      publish(update);
    }),
  ];

  await runWithConcurrency(reports, maximumConcurrentDashboardReports);
  return { baselineSucceeded, utmSucceeded, utmStatuses };
}

function createBreakdownTasks(
  query: DashboardReportQuery,
  dimensions: ReadonlyArray<AnalyticsDimension>,
  signal: AbortSignal,
  api: BreakdownApi,
  metric: DashboardMetric,
  breakdownOrdering: boolean,
  onLoaded: (loaded: LoadedDashboardBreakdown) => void,
): ReadonlyArray<() => Promise<void>> {
  return dimensions.map((dimension) => async () => {
    onLoaded(await loadDashboardBreakdown(query, dimension, signal, api, metric, breakdownOrdering));
  });
}

export async function loadDashboardBreakdown(
  query: DashboardReportQuery,
  dimension: AnalyticsDimension,
  signal: AbortSignal,
  api: BreakdownApi = dashboardApi,
  metric: DashboardMetric = "visitors",
  breakdownOrdering = true,
): Promise<LoadedDashboardBreakdown> {
  const orderBy = breakdownOrdering ? (metric === "pageViews" ? "PageViews" : "Visitors") : undefined;
  const result = await settleRequest(api.breakdown({
    path: { dimension },
    query: { ...query, limit: 11, ...(orderBy ? { orderBy } : {}) },
    signal,
  }));
  return {
    update: { panel: "breakdown", dimension, ...toLoadedReport<AnalyticsBreakdown>(result) },
    responseStatus: result.status === "success" ? result.value.response?.status : undefined,
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
  if (error) return { status: "error", error: reportErrorMessage(withStatus(error, response?.status ?? 0)) };
  return data == null
    ? { status: "error", error: "Analytics returned an empty response." }
    : { status: "success", data };
}

function withStatus(error: unknown, status: number): unknown {
  return typeof error === "object" && error !== null ? { ...error, status } : { status };
}
