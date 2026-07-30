import type { AnalyticsEventDetails, AnalyticsEventProperty, AnalyticsFlagsReport } from "../api/types.gen.js";
import type { AsyncState } from "./async-state.js";

export type SelectedEvent = {
  eventName: string;
  details: AsyncState<AnalyticsEventDetails>;
  eventProperty?: string;
  eventValue?: string;
  propertyName?: string;
  propertySearch?: string;
  property: AsyncState<AnalyticsEventProperty>;
  propertyCache: Readonly<Record<string, AnalyticsEventProperty>>;
};

export type SelectedFlag = {
  flagKey: string;
  report: AsyncState<AnalyticsFlagsReport>;
};
