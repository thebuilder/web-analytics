import { WebAnalyticsService } from "../api/sdk.gen.js";
import type {
  AnalyticsBreakdown,
  AnalyticsConnectionsResponse,
  AnalyticsDocumentRoute,
  AnalyticsEventDetails,
  AnalyticsEventProperty,
  AnalyticsEventsReport,
  AnalyticsFlagsReport,
  AnalyticsSummary,
  FlagsData,
} from "../api/types.gen.js";

type ApiResponse<T> = Promise<{ data?: T; error?: unknown; response: Response }>;
type FlagsOptions = { query?: FlagsData["query"]; signal?: AbortSignal };

export type DashboardApi = {
  connections: (options?: Parameters<typeof WebAnalyticsService.connections<false>>[0]) => ApiResponse<AnalyticsConnectionsResponse>;
  documentRoutes: (options: Parameters<typeof WebAnalyticsService.documentRoutes<false>>[0]) => ApiResponse<AnalyticsDocumentRoute[]>;
  summary: (options?: Parameters<typeof WebAnalyticsService.summary<false>>[0]) => ApiResponse<AnalyticsSummary>;
  events: (options?: Parameters<typeof WebAnalyticsService.events<false>>[0]) => ApiResponse<AnalyticsEventsReport>;
  flags: (options?: FlagsOptions) => ApiResponse<AnalyticsFlagsReport>;
  breakdown: (options: Parameters<typeof WebAnalyticsService.breakdown<false>>[0]) => ApiResponse<AnalyticsBreakdown>;
  eventDetails: (options?: Parameters<typeof WebAnalyticsService.eventDetails<false>>[0]) => ApiResponse<AnalyticsEventDetails>;
  eventPropertyValues: (options?: Parameters<typeof WebAnalyticsService.eventPropertyValues<false>>[0]) => ApiResponse<AnalyticsEventProperty>;
};

export const dashboardApi: DashboardApi = {
  connections: (options) => WebAnalyticsService.connections(options),
  documentRoutes: (options) => WebAnalyticsService.documentRoutes(options),
  summary: (options) => WebAnalyticsService.summary(options),
  events: (options) => WebAnalyticsService.events(options),
  flags: (options) => WebAnalyticsService.flags(options),
  breakdown: (options) => WebAnalyticsService.breakdown(options),
  eventDetails: (options) => WebAnalyticsService.eventDetails(options),
  eventPropertyValues: (options) => WebAnalyticsService.eventPropertyValues(options),
};
