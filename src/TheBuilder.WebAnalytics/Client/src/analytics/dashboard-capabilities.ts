import type { AnalyticsCapabilities, AnalyticsDimension } from "../api/types.gen.js";
import type { AnalyticsFilter, AudienceDimension, UtmDimension } from "./dashboard-url-state.js";
import type { AcquisitionView } from "./dashboard-cards.js";

export const unavailableCapabilities: AnalyticsCapabilities = {
  dimensions: [],
  events: false,
  eventProperties: false,
  flags: false,
};

type DashboardSelection = {
  audienceDimension: AudienceDimension;
  acquisitionView: AcquisitionView;
  utmDimension: UtmDimension;
  filters: AnalyticsFilter[];
};

const audienceDimensions: ReadonlyArray<AudienceDimension> = ["DeviceType", "BrowserName"];
const utmDimensions: ReadonlyArray<UtmDimension> = ["UtmSource", "UtmMedium", "UtmCampaign", "UtmTerm", "UtmContent"];

export function normalizeDashboardSelection(
  selection: DashboardSelection,
  capabilities: AnalyticsCapabilities,
): DashboardSelection {
  const supported = new Set(capabilities.dimensions);
  const audienceDimension = supported.has(selection.audienceDimension)
    ? selection.audienceDimension
    : audienceDimensions.find((dimension) => supported.has(dimension)) ?? selection.audienceDimension;
  const utmDimension = supported.has(selection.utmDimension)
    ? selection.utmDimension
    : utmDimensions.find((dimension) => supported.has(dimension)) ?? "UtmSource";
  const supportsUtm = utmDimensions.some((dimension) => supported.has(dimension));
  return {
    audienceDimension,
    acquisitionView: supportsUtm ? selection.acquisitionView : "referrers",
    utmDimension,
    filters: selection.filters.filter(({ dimension }) => supported.has(dimension)),
  };
}

export function supportsDimension(
  capabilities: AnalyticsCapabilities,
  dimension: AnalyticsDimension,
): boolean {
  return capabilities.dimensions.includes(dimension);
}
