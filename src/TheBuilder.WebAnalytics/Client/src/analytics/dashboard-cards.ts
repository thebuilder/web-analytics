import type { AnalyticsDimension } from "../api/types.gen.js";
import type { AudienceDimension, PagesDimension, UtmDimension } from "./dashboard-url-state.js";
import { isUtmDimension, type UtmCapability } from "./utm-capability.js";

export type DimensionOption<TDimension extends AnalyticsDimension = AnalyticsDimension> = {
  dimension: TDimension;
  headline: string;
  label: string;
};

export type BreakdownDialogGroup = "pages" | "audience" | "acquisition";

export type DashboardCard =
  | {
      kind: "breakdown";
      dimension: AnalyticsDimension;
      headline: string;
      span: "normal" | "wide";
    }
  | {
      kind: "tabbed-breakdown";
      id: "pages" | "audience" | "utm";
      options: ReadonlyArray<DimensionOption>;
      reportLoading: "eager" | "on-demand";
      span: "normal" | "wide";
      planLimited: boolean;
    };

export type AcquisitionView = "referrers" | "utm";
export type DashboardReportPlan = {
  cards: ReadonlyArray<DashboardCard>;
  dimensions: ReadonlyArray<AnalyticsDimension>;
};

export const PAGES_OPTIONS: ReadonlyArray<DimensionOption<PagesDimension>> = [
  { dimension: "RequestPath", headline: "Pages", label: "Pages" },
  { dimension: "EntryPage", headline: "Entry pages", label: "Entry pages" },
  { dimension: "ExitPage", headline: "Exit pages", label: "Exit pages" },
];

export const AUDIENCE_OPTIONS: ReadonlyArray<DimensionOption<AudienceDimension>> = [
  { dimension: "DeviceType", headline: "Devices", label: "Devices" },
  { dimension: "BrowserName", headline: "Browsers", label: "Browsers" },
];

export const UTM_OPTIONS: ReadonlyArray<DimensionOption<UtmDimension>> = [
  { dimension: "UtmSource", headline: "UTM sources", label: "Source" },
  { dimension: "UtmMedium", headline: "UTM media", label: "Medium" },
  { dimension: "UtmCampaign", headline: "UTM campaigns", label: "Campaign" },
  { dimension: "UtmTerm", headline: "UTM terms", label: "Term" },
  { dimension: "UtmContent", headline: "UTM content", label: "Content" },
];

export function isPageDimension(dimension?: AnalyticsDimension): boolean {
  return dimension === "RequestPath" || dimension === "Route" || dimension === "EntryPage" || dimension === "ExitPage";
}

export function breakdownDialogGroup(dimension?: AnalyticsDimension): BreakdownDialogGroup | undefined {
  if (dimension === "RequestPath" || dimension === "EntryPage" || dimension === "ExitPage") return "pages";
  if (dimension === "DeviceType" || dimension === "BrowserName") return "audience";
  if (dimension === "ReferrerHostname" || dimension === "Referrer" || (dimension && isUtmDimension(dimension))) return "acquisition";
  return undefined;
}

export function referrerDimensionOption(dimension: "ReferrerHostname" | "Referrer"): DimensionOption {
  return { dimension, headline: "Referrers", label: "Referrers" };
}

const SHARED_CARDS: ReadonlyArray<DashboardCard> = [
  { kind: "breakdown", dimension: "Country", headline: "Countries", span: "normal" },
  { kind: "tabbed-breakdown", id: "audience", options: AUDIENCE_OPTIONS, reportLoading: "eager", span: "normal", planLimited: false },
  { kind: "breakdown", dimension: "OsName", headline: "Operating systems", span: "normal" },
];

const UTM_CARD: DashboardCard = {
  kind: "tabbed-breakdown",
  id: "utm",
  options: UTM_OPTIONS,
  reportLoading: "on-demand",
  span: "wide",
  planLimited: true,
};

export function dashboardCards(
  utmCapability: UtmCapability,
  referrerDimension: "ReferrerHostname" | "Referrer" = "ReferrerHostname",
): ReadonlyArray<DashboardCard> {
  const cards: DashboardCard[] = [
    { kind: "tabbed-breakdown", id: "pages", options: PAGES_OPTIONS, reportLoading: "on-demand", span: "wide", planLimited: false },
    { kind: "breakdown", ...referrerDimensionOption(referrerDimension), span: "wide" },
    ...SHARED_CARDS,
  ];
  if (utmCapability === "available") cards.push(UTM_CARD);
  return cards;
}

export function dashboardReportPlan(
  utmCapability: UtmCapability,
  acquisitionView: AcquisitionView,
  utmDimension: UtmDimension,
  referrerDimension: "ReferrerHostname" | "Referrer" = "ReferrerHostname",
  pagesDimension: PagesDimension = "RequestPath",
): DashboardReportPlan {
  const cards = dashboardCards(utmCapability, referrerDimension);
  const dimensions = cards.flatMap((card) => card.kind === "breakdown"
    ? [card.dimension]
    : card.reportLoading === "eager"
      ? card.options.map(({ dimension }) => dimension)
      : card.id === "pages" ? [pagesDimension] : []);

  if (utmCapability === "unknown") dimensions.push("UtmSource");
  if (utmCapability === "available" && acquisitionView === "utm") dimensions.push(utmDimension);

  return { cards, dimensions };
}

export function selectedCardDimension(
  card: DashboardCard,
  audience: AudienceDimension,
  utm: UtmDimension,
  pages: PagesDimension = "RequestPath",
): DimensionOption {
  if (card.kind === "breakdown") {
    return { dimension: card.dimension, headline: card.headline, label: card.headline };
  }
  const selected = card.id === "audience" ? audience : card.id === "pages" ? pages : utm;
  return card.options.find(({ dimension }) => dimension === selected) ?? card.options[0];
}
