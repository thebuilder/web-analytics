import type { AnalyticsDimension } from "../api/types.gen.js";
import type { AudienceDimension, UtmDimension } from "./dashboard-url-state.js";
import type { UtmCapability } from "./utm-capability.js";

type DimensionOption<TDimension extends AnalyticsDimension = AnalyticsDimension> = {
  dimension: TDimension;
  headline: string;
  label: string;
};

export type DashboardCard =
  | {
      kind: "breakdown";
      dimension: AnalyticsDimension;
      headline: string;
      span: "normal" | "wide";
    }
  | {
      kind: "tabbed-breakdown";
      id: "audience" | "utm";
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

const AUDIENCE_OPTIONS: ReadonlyArray<DimensionOption<AudienceDimension>> = [
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

const SHARED_CARDS: ReadonlyArray<DashboardCard> = [
  { kind: "breakdown", dimension: "ReferrerHostname", headline: "Referrers", span: "wide" },
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

export function dashboardCards(documentScoped: boolean, utmCapability: UtmCapability): ReadonlyArray<DashboardCard> {
  const cards: DashboardCard[] = [
    ...(documentScoped ? [] : [{ kind: "breakdown" as const, dimension: "RequestPath" as const, headline: "Pages", span: "wide" as const }]),
    ...SHARED_CARDS,
  ];
  if (utmCapability === "available") cards.push(UTM_CARD);
  return cards;
}

export function dashboardReportPlan(
  documentScoped: boolean,
  utmCapability: UtmCapability,
  acquisitionView: AcquisitionView,
  utmDimension: UtmDimension,
): DashboardReportPlan {
  const cards = dashboardCards(documentScoped, utmCapability);
  const dimensions = cards.flatMap((card) => card.kind === "breakdown"
    ? [card.dimension]
    : card.reportLoading === "eager" ? card.options.map(({ dimension }) => dimension) : []);

  if (utmCapability === "unknown") dimensions.push("UtmSource");
  if (utmCapability === "available" && acquisitionView === "utm") dimensions.push(utmDimension);

  return { cards, dimensions };
}

export function selectedCardDimension(
  card: DashboardCard,
  audience: AudienceDimension,
  utm: UtmDimension,
): DimensionOption {
  if (card.kind === "breakdown") {
    return { dimension: card.dimension, headline: card.headline, label: card.headline };
  }
  const selected = card.id === "audience" ? audience : utm;
  return card.options.find(({ dimension }) => dimension === selected) ?? card.options[0];
}
