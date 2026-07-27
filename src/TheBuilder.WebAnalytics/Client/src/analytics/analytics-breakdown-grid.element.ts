import { LitElement, css, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AnalyticsBreakdown, AnalyticsDimension, AnalyticsEventsReport, AnalyticsFlagsReport } from "../api/types.gen.js";
import { breakdownMetricTotal, topBreakdownRows } from "./breakdown-rows.js";
import { selectedCardDimension, type AcquisitionView, type DashboardCard } from "./dashboard-cards.js";
import type { AnalyticsFilter, AudienceDimension, DashboardMetric, UtmDimension } from "./dashboard-url-state.js";
import { topEventRows } from "./event-rows.js";
import "./breakdown-table.element.js";
import "./event-table.element.js";
import "./flag-card.element.js";
import { isInitialLoading, stateData, type AsyncState } from "./async-state.js";
import type { ReportTabGroup } from "./report-tabs.js";

@customElement("web-analytics-breakdown-grid")
export class WebAnalyticsBreakdownGridElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) cards: ReadonlyArray<DashboardCard> = [];
  @property({ attribute: false }) breakdowns: Partial<Record<AnalyticsDimension, AsyncState<AnalyticsBreakdown>>> = {};
  @property({ attribute: false }) events: AsyncState<AnalyticsEventsReport> = { status: "loading" };
  @property({ attribute: false }) flags: AsyncState<AnalyticsFlagsReport> = { status: "loading" };
  @property({ attribute: false }) selectedFlag?: AsyncState<AnalyticsFlagsReport>;
  @property({ attribute: false }) filters: AnalyticsFilter[] = [];
  @property() metric: DashboardMetric = "visitors";
  @property() audienceDimension: AudienceDimension = "DeviceType";
  @property() acquisitionView: AcquisitionView = "referrers";
  @property() utmDimension: UtmDimension = "UtmSource";
  @property() baseUrl?: string;
  @property({ type: Boolean }) supportsEvents = true;
  @property({ type: Boolean }) supportsGlobalEventFiltering = false;
  @property({ type: Boolean }) supportsEventDetails = true;
  @property({ type: Boolean }) supportsFlags = true;

  #dispatch(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  #tabsForCard(card: Extract<DashboardCard, { kind: "tabbed-breakdown" }>): ReportTabGroup {
    return {
      ariaLabel: "Audience technology",
      idPrefix: `${card.id}-card-tab`,
      options: card.options.map(({ dimension, label }) => ({ value: dimension, label })),
      selected: this.audienceDimension,
    };
  }

  #acquisitionTabs(utmAvailable: boolean): ReportTabGroup {
    const selected = utmAvailable ? this.acquisitionView : "referrers";
    return {
      ariaLabel: "Traffic source",
      idPrefix: "acquisition-card-tab",
      options: [
        { value: "referrers", label: "Referrers" },
        ...(utmAvailable ? [{ value: "utm", label: "UTM" }] : []),
      ],
      selected,
    };
  }

  #utmTabs(card: Extract<DashboardCard, { kind: "tabbed-breakdown" }>): ReportTabGroup {
    return {
      appearance: "secondary",
      ariaLabel: "UTM parameter",
      idPrefix: "utm-card-tab",
      options: card.options.map(({ dimension, label }) => ({ value: dimension, label })),
      selected: this.utmDimension,
    };
  }

  #renderBreakdownFooter(
    loading: boolean,
    unavailable: string | undefined,
    hasRows: boolean,
    selected: ReturnType<typeof selectedCardDimension>,
  ) {
    if (!loading && hasRows && !unavailable) {
      return html`
        <uui-button class="view-all" compact look="default" label=${`View all ${selected.headline}`} @click=${() => this.#dispatch("view-breakdown", selected)}>View all</uui-button>
      `;
    }
    return !loading && unavailable
      ? html`<uui-button look="secondary" label=${`Retry ${selected.headline} report`} @click=${() => this.#dispatch("retry-reports")}>Retry</uui-button>`
      : "";
  }

  #renderCard(card: DashboardCard) {
    const selected = selectedCardDimension(card, this.audienceDimension, this.utmDimension);
    const state = this.breakdowns[selected.dimension];
    const loading = isInitialLoading(state);
    const allRows = state ? stateData(state)?.rows ?? [] : [];
    const rows = topBreakdownRows(allRows, 10);
    const total = breakdownMetricTotal(allRows, this.metric);
    const unavailable = state?.status === "error" ? state.message : undefined;
    const planLimited = card.kind === "tabbed-breakdown" && card.planLimited;
    const linkValues = selected.dimension === "RequestPath" || selected.dimension === "Route";
    const headingTabs = card.kind === "tabbed-breakdown" ? this.#tabsForCard(card) : undefined;
    return html`
      <uui-box class=${`breakdown-card ${card.span === "wide" ? "wide" : ""}`} aria-busy=${state?.status === "loading" ? "true" : "false"}>
        <div class="breakdown-card-layout">
          <web-analytics-breakdown-table
            .headline=${selected.headline}
            .dimension=${selected.dimension}
            .metric=${this.metric}
            .compact=${true}
            .total=${total}
            .rows=${rows}
            .loading=${loading}
            .filters=${this.filters}
            .baseUrl=${this.baseUrl}
            .linkValues=${linkValues}
            .headingTabs=${headingTabs}
            @heading-tab-change=${(event: CustomEvent<{ value: AnalyticsDimension }>) => card.kind === "tabbed-breakdown" && this.#dispatch(card.id === "audience" ? "audience-change" : "utm-change", { dimension: event.detail.value })}
            .unavailable=${unavailable}>
          </web-analytics-breakdown-table>
          ${planLimited && unavailable ? html`<p class="hint breakdown-hint">UTM reporting availability depends on your analytics plan and reporting window.</p>` : ""}
          <footer class="breakdown-footer">
            ${this.#renderBreakdownFooter(loading, unavailable, rows.length > 0, selected)}
          </footer>
        </div>
      </uui-box>
    `;
  }

  #renderAcquisitionCard(referrerCard: DashboardCard, utmCard?: Extract<DashboardCard, { kind: "tabbed-breakdown" }>) {
    const utmAvailable = Boolean(utmCard);
    const showingUtm = utmAvailable && this.acquisitionView === "utm" && utmCard;
    const selected = showingUtm
      ? selectedCardDimension(utmCard, this.audienceDimension, this.utmDimension)
      : selectedCardDimension(referrerCard, this.audienceDimension, this.utmDimension);
    const report = this.breakdowns[selected.dimension];
    const loading = isInitialLoading(report);
    const allRows = report ? stateData(report)?.rows ?? [] : [];
    const rows = topBreakdownRows(allRows, 10);
    const total = breakdownMetricTotal(allRows, this.metric);
    const unavailable = report?.status === "error" ? report.message : undefined;
    return html`
      <uui-box class="breakdown-card wide" aria-busy=${report?.status === "loading" ? "true" : "false"}>
        <div class="breakdown-card-layout">
          <web-analytics-breakdown-table
            .headline=${selected.headline}
            .dimension=${selected.dimension}
            .metric=${this.metric}
            .compact=${true}
            .total=${total}
            .rows=${rows}
            .loading=${loading}
            .filters=${this.filters}
            .baseUrl=${this.baseUrl}
            .headingTabs=${this.#acquisitionTabs(utmAvailable)}
            .subheadingTabs=${showingUtm ? this.#utmTabs(utmCard) : undefined}
            .unavailable=${unavailable}
            @heading-tab-change=${(event: CustomEvent<{ value: AcquisitionView }>) => this.#dispatch("acquisition-change", { view: event.detail.value })}
            @subheading-tab-change=${(event: CustomEvent<{ value: UtmDimension }>) => this.#dispatch("utm-change", { dimension: event.detail.value })}></web-analytics-breakdown-table>
          <footer class="breakdown-footer">
            ${this.#renderBreakdownFooter(loading, unavailable, rows.length > 0, selected)}
          </footer>
        </div>
      </uui-box>
    `;
  }

  #renderEvents() {
    const loading = isInitialLoading(this.events);
    const rows = topEventRows(stateData(this.events)?.rows ?? [], 10);
    const empty = !loading && rows.length === 0;
    return html`
      <uui-box class="breakdown-card feature-card" aria-busy=${this.events.status === "loading" ? "true" : "false"}>
        <div class=${`breakdown-card-layout${empty ? " empty-card-layout" : ""}`}>
          <web-analytics-event-table .rows=${rows} .filters=${this.filters} .loading=${loading} .detailsEnabled=${this.supportsEventDetails} .filteringEnabled=${this.supportsGlobalEventFiltering}></web-analytics-event-table>
          ${empty ? "" : html`<footer class="breakdown-footer">
            ${!loading && rows.length ? html`<uui-button class="view-all" compact look="default" label="View all events" @click=${() => this.#dispatch("view-events")}>View all</uui-button>` : ""}
          </footer>`}
        </div>
      </uui-box>
    `;
  }

  render() {
    const standardCards = this.cards.filter((card) => card.kind !== "tabbed-breakdown" || card.id !== "utm");
    const utmCard = this.cards.find((card): card is Extract<DashboardCard, { kind: "tabbed-breakdown" }> => card.kind === "tabbed-breakdown" && card.id === "utm");
    const referrerCard = standardCards.find((card) => card.kind === "breakdown" && (card.dimension === "ReferrerHostname" || card.dimension === "Referrer"));
    const renderCard = (card: DashboardCard) => card === referrerCard ? this.#renderAcquisitionCard(card, utmCard) : this.#renderCard(card);
    const primaryCards = standardCards.filter((card) => card.span === "wide");
    const detailCards = standardCards.filter((card) => card.span === "normal");
    return html`
      <section class="grid primary-grid" aria-label="Primary traffic breakdowns">
        ${primaryCards.map(renderCard)}
      </section>
      <section class="grid detail-grid" aria-label="Traffic breakdowns">
        ${detailCards.map(renderCard)}
      </section>
      ${this.supportsEvents || this.supportsFlags ? html`<section class="grid feature-grid" aria-label="Optional analytics reports">
        ${this.supportsEvents ? this.#renderEvents() : ""}
        ${this.supportsFlags ? html`<uui-box class="breakdown-card flags-card feature-card" aria-busy=${this.flags.status === "loading" ? "true" : "false"}>
          <web-analytics-flag-card .report=${this.flags} .selected=${this.selectedFlag}></web-analytics-flag-card>
        </uui-box>` : ""}
      </section>` : ""}
    `;
  }

  static styles = [UmbTextStyles, css`
    .grid { display: grid; gap: var(--uui-size-layout-1); }
    .grid + .grid { margin-block-start: var(--uui-size-layout-1); }
    .primary-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 28rem), 1fr)); }
    .feature-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 28rem), 1fr)); }
    .detail-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
    .breakdown-card { --uui-box-default-padding: 0; min-inline-size: 0; overflow: hidden; position: relative; }
    .flags-card { --uui-box-default-padding: 0; }
    .breakdown-card-layout { box-sizing: border-box; min-block-size: 100%; padding-bottom: var(--uui-size-layout-3); }
    .empty-card-layout { block-size: 100%; padding-bottom: 0; }
    .breakdown-footer { align-items: center; background: color-mix(in srgb, var(--uui-color-surface-alt) 9%, var(--uui-color-surface)); border-top: 1px solid var(--uui-color-border); bottom: 0; box-sizing: border-box; display: flex; justify-content: flex-end; left: 0; min-block-size: var(--uui-size-layout-3); padding: 0 var(--uui-size-space-4); position: absolute; right: 0; }
    .view-all { --uui-button-border-width: 0; --uui-button-content-align: right; }
    .hint { color: var(--uui-color-text-alt); }
    .breakdown-hint { margin: 0; padding: var(--uui-size-space-3) var(--uui-size-space-5); }
  `];
}

declare global { interface HTMLElementTagNameMap { "web-analytics-breakdown-grid": WebAnalyticsBreakdownGridElement; } }
