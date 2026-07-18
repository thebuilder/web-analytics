export const ANALYTICS_AVAILABILITY_CHANGED_EVENT = "vercel-analytics-availability-changed";

export type AnalyticsAvailabilityChangedDetail = {
  enabled: boolean;
};

export function announceAnalyticsAvailability(enabled: boolean): void {
  window.dispatchEvent(new CustomEvent<AnalyticsAvailabilityChangedDetail>(
    ANALYTICS_AVAILABILITY_CHANGED_EVENT,
    { detail: { enabled } },
  ));
}
