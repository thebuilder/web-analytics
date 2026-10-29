import type { AnalyticsDimension } from "../api/types.gen.js";
import type { AudienceDimension, PagesDimension, UtmDimension } from "./dashboard-url-state.js";
import { isUtmDimension, type UtmCapability } from "./utm-capability.js";

export type DimensionOption<TDimension extends AnalyticsDimension = AnalyticsDimension> = {
  dimension: TDimension;
  headline: string;
  label: string;
};

export type BreakdownDialogGroup = "pages" | "audience" | "acquisition";

export type TabbedCardId = "pages" | "audience" | "utm";

/** The selected tab of each tabbed card, keyed by card id. */
export type CardSelections = { pages: PagesDimension; audience: AudienceDimension; utm: UtmDimension };

export type DashboardCard =
  | {
      kind: "breakdown";
      dimension: AnalyticsDimension;
      headline: string;
      span: "normal" | "wide";
    }
  | {
      kind: "tabbed-breakdown";
      id: TabbedCardId;
      /** Accessible name of the card's tab list. */
      tabsLabel: string;
      options: ReadonlyArray<DimensionOption>;
      /** eager loads every tab with the dashboard, selected loads only the open tab, on-demand loads when its view opens. */
      reportLoading: "eager" | "selected" | "on-demand";
      /** Whether the card turns into a plain card when the connection supports only one of its tabs. */
      collapsesToSingleOption: boolean;
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
  { kind: "tabbed-breakdown", id: "audience", tabsLabel: "Audience technology", options: AUDIENCE_OPTIONS, reportLoading: "eager", collapsesToSingleOption: true, span: "normal", planLimited: false },
  { kind: "breakdown", dimension: "OsName", headline: "Operating systems", span: "normal" },
];

const UTM_CARD: DashboardCard = {
  kind: "tabbed-breakdown",
  id: "utm",
  tabsLabel: "UTM parameter",
  options: UTM_OPTIONS,
  reportLoading: "on-demand",
  collapsesToSingleOption: false,
  span: "wide",
  planLimited: true,
};

export function dashboardCards(
  utmCapability: UtmCapability,
  referrerDimension: "ReferrerHostname" | "Referrer" = "ReferrerHostname",
): ReadonlyArray<DashboardCard> {
  const cards: DashboardCard[] = [
    { kind: "tabbed-breakdown", id: "pages", tabsLabel: "Page report", options: PAGES_OPTIONS, reportLoading: "selected", collapsesToSingleOption: true, span: "wide", planLimited: false },
    { kind: "breakdown", ...referrerDimensionOption(referrerDimension), span: "wide" },
    ...SHARED_CARDS,
  ];
  if (utmCapability === "available") cards.push(UTM_CARD);
  return cards;
}

export function dashboardReportPlan(
  utmCapability: UtmCapability,
  acquisitionView: AcquisitionView,
  selections: CardSelections,
  referrerDimension: "ReferrerHostname" | "Referrer" = "ReferrerHostname",
): DashboardReportPlan {
  const cards = dashboardCards(utmCapability, referrerDimension);
  const dimensions = cards.flatMap((card) => card.kind === "breakdown"
    ? [card.dimension]
    : card.reportLoading === "eager"
      ? card.options.map(({ dimension }) => dimension)
      : card.reportLoading === "selected" ? [selectedCardDimension(card, selections).dimension] : []);

  if (utmCapability === "unknown") dimensions.push("UtmSource");
  if (utmCapability === "available" && acquisitionView === "utm") dimensions.push(selections.utm);

  return { cards, dimensions };
}

export function selectedCardDimension(card: DashboardCard, selections: CardSelections): DimensionOption {
  if (card.kind === "breakdown") {
    return { dimension: card.dimension, headline: card.headline, label: card.headline };
  }
  const selected = selections[card.id];
  return card.options.find(({ dimension }) => dimension === selected) ?? card.options[0];
}
