import { UmbracoVercelAnalyticsService } from "../api/sdk.gen.js";
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
  connections: (options?: Parameters<typeof UmbracoVercelAnalyticsService.connections<false>>[0]) => ApiResponse<AnalyticsConnectionsResponse>;
  documentRoutes: (options: Parameters<typeof UmbracoVercelAnalyticsService.documentRoutes<false>>[0]) => ApiResponse<AnalyticsDocumentRoute[]>;
  summary: (options?: Parameters<typeof UmbracoVercelAnalyticsService.summary<false>>[0]) => ApiResponse<AnalyticsSummary>;
  events: (options?: Parameters<typeof UmbracoVercelAnalyticsService.events<false>>[0]) => ApiResponse<AnalyticsEventsReport>;
  flags: (options?: FlagsOptions) => ApiResponse<AnalyticsFlagsReport>;
  breakdown: (options: Parameters<typeof UmbracoVercelAnalyticsService.breakdown<false>>[0]) => ApiResponse<AnalyticsBreakdown>;
  eventDetails: (options?: Parameters<typeof UmbracoVercelAnalyticsService.eventDetails<false>>[0]) => ApiResponse<AnalyticsEventDetails>;
  eventPropertyValues: (options?: Parameters<typeof UmbracoVercelAnalyticsService.eventPropertyValues<false>>[0]) => ApiResponse<AnalyticsEventProperty>;
};

export const dashboardApi: DashboardApi = {
  connections: (options) => UmbracoVercelAnalyticsService.connections(options),
  documentRoutes: (options) => UmbracoVercelAnalyticsService.documentRoutes(options),
  summary: (options) => UmbracoVercelAnalyticsService.summary(options),
  events: (options) => UmbracoVercelAnalyticsService.events(options),
  flags: (options) => UmbracoVercelAnalyticsService.flags(options),
  breakdown: (options) => UmbracoVercelAnalyticsService.breakdown(options),
  eventDetails: (options) => UmbracoVercelAnalyticsService.eventDetails(options),
  eventPropertyValues: (options) => UmbracoVercelAnalyticsService.eventPropertyValues(options),
};
