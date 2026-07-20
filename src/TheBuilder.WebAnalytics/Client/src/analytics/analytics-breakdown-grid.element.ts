import { LitElement, css, customElement, html, property, state } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AnalyticsBreakdown, AnalyticsDimension, AnalyticsEventsReport, AnalyticsFlagsReport } from "../api/types.gen.js";
import { breakdownMetricTotal, topBreakdownRows } from "./breakdown-rows.js";
import { selectedCardDimension, type DashboardCard, UTM_OPTIONS } from "./dashboard-cards.js";
import type { AnalyticsFilter, AudienceDimension, DashboardMetric, UtmDimension } from "./dashboard-url-state.js";
import { topEventRows } from "./event-rows.js";
import "./breakdown-table.element.js";
import "./event-table.element.js";
import "./flag-card.element.js";
import { stateData, type AsyncState } from "./async-state.js";

@customElement("vercel-analytics-breakdown-grid")
export class VercelAnalyticsBreakdownGridElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) cards: ReadonlyArray<DashboardCard> = [];
  @property({ attribute: false }) breakdowns: Partial<Record<AnalyticsDimension, AsyncState<AnalyticsBreakdown>>> = {};
  @property({ attribute: false }) events: AsyncState<AnalyticsEventsReport> = { status: "loading" };
  @property({ attribute: false }) flags: AsyncState<AnalyticsFlagsReport> = { status: "loading" };
  @property({ attribute: false }) selectedFlag?: AsyncState<AnalyticsFlagsReport>;
  @property({ attribute: false }) filters: AnalyticsFilter[] = [];
  @property() metric: DashboardMetric = "visitors";
  @property() audienceDimension: AudienceDimension = "DeviceType";
  @property() utmDimension: UtmDimension = "UtmSource";
  @property() baseUrl?: string;
  @state() private acquisitionView: "referrers" | "utm" = "referrers";

  #dispatch(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  #onTabKeydown(event: KeyboardEvent): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from((event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? []);
    const currentIndex = tabs.indexOf(event.currentTarget as HTMLButtonElement);
    const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowLeft" ? (currentIndex - 1 + tabs.length) % tabs.length
        : (currentIndex + 1) % tabs.length;
    tabs[targetIndex]?.click();
    tabs[targetIndex]?.focus();
  }

  #renderTabs(card: Extract<DashboardCard, { kind: "tabbed-breakdown" }>) {
    const selected = card.id === "audience" ? this.audienceDimension : this.utmDimension;
    const options = card.id === "utm" ? UTM_OPTIONS : card.options;
    return html`
      <div slot="heading" class="breakdown-tabs" role="tablist" aria-label=${card.id === "audience" ? "Audience technology" : "UTM parameter"}>
        ${options.map(({ dimension, label }) => html`
          <button
            type="button"
            role="tab"
            aria-selected=${selected === dimension}
            tabindex=${selected === dimension ? 0 : -1}
            @click=${() => this.#dispatch(card.id === "audience" ? "audience-change" : "utm-change", { dimension })}
            @keydown=${this.#onTabKeydown}>${label}</button>
        `)}
      </div>
    `;
  }

  #renderAcquisitionTabs(utmAvailable: boolean) {
    const selected = utmAvailable ? this.acquisitionView : "referrers";
    return html`
      <div slot="heading" class="breakdown-tabs acquisition-tabs" role="tablist" aria-label="Traffic source">
        <button
          type="button"
          role="tab"
          aria-selected=${selected === "referrers"}
          tabindex=${selected === "referrers" ? 0 : -1}
          @click=${() => { this.acquisitionView = "referrers"; }}
          @keydown=${this.#onTabKeydown}>Referrers</button>
        ${utmAvailable ? html`
          <button
            type="button"
            role="tab"
            aria-selected=${selected === "utm"}
            tabindex=${selected === "utm" ? 0 : -1}
            @click=${() => { this.acquisitionView = "utm"; }}
            @keydown=${this.#onTabKeydown}>UTM Parameters</button>
        ` : ""}
      </div>
    `;
  }

  #renderUtmTabs(card: Extract<DashboardCard, { kind: "tabbed-breakdown" }>) {
    return html`
      <div slot="subheading" class="utm-tabs" role="tablist" aria-label="UTM parameter">
        ${card.options.map(({ dimension, label }) => html`
          <button
            type="button"
            role="tab"
            aria-selected=${this.utmDimension === dimension}
            tabindex=${this.utmDimension === dimension ? 0 : -1}
            @click=${() => this.#dispatch("utm-change", { dimension })}
            @keydown=${this.#onTabKeydown}>${label}</button>
        `)}
      </div>
    `;
  }

  #renderCard(card: DashboardCard) {
    const selected = selectedCardDimension(card, this.audienceDimension, this.utmDimension);
    const state = this.breakdowns[selected.dimension];
    const loading = !state || state.status === "idle" || state.status === "loading";
    const allRows = state ? stateData(state)?.rows ?? [] : [];
    const rows = topBreakdownRows(allRows, 10);
    const total = breakdownMetricTotal(allRows, this.metric);
    const unavailable = state?.status === "error" ? state.message : undefined;
    const planLimited = card.kind === "tabbed-breakdown" && card.planLimited;
    const linkValues = selected.dimension === "RequestPath" || selected.dimension === "Route";
    return html`
      <uui-box class=${`breakdown-card ${card.span === "wide" ? "wide" : ""}`}>
        <div class="breakdown-card-layout">
          <vercel-analytics-breakdown-table
            .headline=${selected.headline}
            .dimension=${selected.dimension}
            .metric=${this.metric}
            .total=${total}
            .rows=${rows}
            .loading=${loading}
            .filters=${this.filters}
            .baseUrl=${this.baseUrl}
            .linkValues=${linkValues}
            .unavailable=${unavailable}>
            ${card.kind === "tabbed-breakdown" ? this.#renderTabs(card) : ""}
          </vercel-analytics-breakdown-table>
          ${planLimited && unavailable ? html`<p class="hint breakdown-hint">UTM reporting availability depends on your Vercel plan and reporting window.</p>` : ""}
          <footer class="breakdown-footer">
            ${!loading && !unavailable && rows.length ? html`
              <uui-button look="secondary" label=${`View all ${selected.headline}`} @click=${() => this.#dispatch("view-breakdown", selected)}>View all</uui-button>
            ` : !loading && unavailable ? html`
              <uui-button look="secondary" label=${`Retry ${selected.headline} report`} @click=${() => this.#dispatch("retry-reports")}>Retry</uui-button>
            ` : ""}
          </footer>
        </div>
      </uui-box>
    `;
  }

  #renderAcquisitionCard(referrerCard: DashboardCard, utmCard?: Extract<DashboardCard, { kind: "tabbed-breakdown" }>) {
    const utmAvailable = Boolean(utmCard?.options.some(({ dimension }) => {
      const state = this.breakdowns[dimension];
      return state ? stateData(state) !== undefined : false;
    }));
    const showingUtm = utmAvailable && this.acquisitionView === "utm" && utmCard;
    const selected = showingUtm
      ? selectedCardDimension(utmCard, this.audienceDimension, this.utmDimension)
      : selectedCardDimension(referrerCard, this.audienceDimension, this.utmDimension);
    const report = this.breakdowns[selected.dimension];
    const loading = !report || report.status === "idle" || report.status === "loading";
    const allRows = report ? stateData(report)?.rows ?? [] : [];
    const rows = topBreakdownRows(allRows, 10);
    const total = breakdownMetricTotal(allRows, this.metric);
    const unavailable = report?.status === "error" ? report.message : undefined;

    return html`
      <uui-box class="breakdown-card wide">
        <div class="breakdown-card-layout">
          <vercel-analytics-breakdown-table
            .headline=${selected.headline}
            .dimension=${selected.dimension}
            .metric=${this.metric}
            .total=${total}
            .rows=${rows}
            .loading=${loading}
            .filters=${this.filters}
            .baseUrl=${this.baseUrl}
            .hasSubheading=${Boolean(showingUtm)}
            .unavailable=${unavailable}>
            ${this.#renderAcquisitionTabs(utmAvailable)}
            ${showingUtm ? this.#renderUtmTabs(utmCard) : ""}
          </vercel-analytics-breakdown-table>
          <footer class="breakdown-footer">
            ${!loading && !unavailable && rows.length ? html`
              <uui-button look="secondary" label=${`View all ${selected.headline}`} @click=${() => this.#dispatch("view-breakdown", selected)}>View all</uui-button>
            ` : !loading && unavailable ? html`
              <uui-button look="secondary" label=${`Retry ${selected.headline} report`} @click=${() => this.#dispatch("retry-reports")}>Retry</uui-button>
            ` : ""}
          </footer>
        </div>
      </uui-box>
    `;
  }

  #renderEvents() {
    const loading = this.events.status === "idle" || this.events.status === "loading";
    const rows = topEventRows(stateData(this.events)?.rows ?? [], 10);
    const empty = !loading && rows.length === 0;
    return html`
      <uui-box class="breakdown-card wide">
        <div class=${`breakdown-card-layout${empty ? " empty-card-layout" : ""}`}>
          <vercel-analytics-event-table .rows=${rows} .filters=${this.filters} .loading=${loading}></vercel-analytics-event-table>
          ${empty ? "" : html`<footer class="breakdown-footer">
            ${!loading && rows.length ? html`<uui-button look="secondary" label="View all events" @click=${() => this.#dispatch("view-events")}>View all</uui-button>` : ""}
          </footer>`}
        </div>
      </uui-box>
    `;
  }

  render() {
    const standardCards = this.cards.filter((card) => card.kind !== "tabbed-breakdown" || card.id !== "utm");
    const utmCard = this.cards.find((card): card is Extract<DashboardCard, { kind: "tabbed-breakdown" }> => card.kind === "tabbed-breakdown" && card.id === "utm");
    const referrerCard = standardCards.find((card) => card.kind === "breakdown" && card.dimension === "ReferrerHostname");
    const renderCard = (card: DashboardCard) => card === referrerCard ? this.#renderAcquisitionCard(card, utmCard) : this.#renderCard(card);
    const documentScoped = !standardCards.some((card) => card.kind === "breakdown" && card.dimension === "RequestPath");
    const cardsBeforeEvents = documentScoped ? standardCards.slice(0, 1) : standardCards;
    const cardsAfterEvents = documentScoped ? standardCards.slice(1) : [];
    return html`
      <section class="grid" aria-label="Traffic breakdowns">
        ${cardsBeforeEvents.map(renderCard)}
        ${this.#renderEvents()}
        ${cardsAfterEvents.map(renderCard)}
        <uui-box class=${`breakdown-card flags-card${documentScoped ? " document-flags-card" : " wide"}`}>
          <vercel-analytics-flag-card .report=${this.flags} .selected=${this.selectedFlag}></vercel-analytics-flag-card>
        </uui-box>
      </section>
    `;
  }

  static styles = [UmbTextStyles, css`
    .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--uui-size-layout-1); }
    .breakdown-card { --uui-box-default-padding: 0; grid-column: span 2; overflow: hidden; position: relative; }
    .wide { grid-column: span 3; }
    .flags-card { --uui-box-default-padding: 0; }
    .document-flags-card { grid-column: 1 / -1; inline-size: 50%; justify-self: center; }
    .breakdown-card-layout { box-sizing: border-box; min-block-size: 100%; padding-bottom: 3.25rem; }
    .empty-card-layout { block-size: 100%; padding-bottom: 0; }
    .breakdown-footer { align-items: center; background: color-mix(in srgb, var(--uui-color-surface-alt) 18%, var(--uui-color-surface)); border-top: 1px solid var(--uui-color-border); bottom: 0; box-sizing: border-box; display: flex; justify-content: flex-end; left: 0; min-block-size: 3.25rem; padding: var(--uui-size-space-1) var(--uui-size-space-4); position: absolute; right: 0; }
    .hint { color: var(--uui-color-text-alt); }
    .breakdown-hint { margin: 0; padding: var(--uui-size-space-3) var(--uui-size-space-5); }
    .breakdown-tabs { align-items: stretch; display: flex; margin: calc(-1 * var(--uui-size-space-3)); min-inline-size: 0; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: thin; }
    .breakdown-tabs button { appearance: none; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--uui-color-text-alt); cursor: pointer; flex: 0 0 auto; font: inherit; font-weight: 500; padding: calc(var(--uui-size-space-3) - 1px) var(--uui-size-space-3); white-space: nowrap; }
    .breakdown-tabs button[aria-selected="true"] { border-bottom-color: var(--uui-color-selected); color: var(--uui-color-text); font-weight: 700; }
    .breakdown-tabs button:hover { background: var(--uui-color-surface-alt); }
    .breakdown-tabs button:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .utm-tabs { align-items: center; display: flex; gap: var(--uui-size-space-1); margin-inline: calc(-1 * var(--uui-size-space-3)); min-inline-size: 0; overflow-x: auto; padding-block: var(--uui-size-space-2); scrollbar-width: thin; }
    .utm-tabs button { appearance: none; background: transparent; border: 0; border-radius: var(--uui-border-radius); color: var(--uui-color-text-alt); cursor: pointer; flex: 0 0 auto; font: inherit; padding: var(--uui-size-space-2) var(--uui-size-space-3); }
    .utm-tabs button[aria-selected="true"] { background: var(--uui-color-surface-alt); color: var(--uui-color-text); font-weight: 600; }
    .utm-tabs button:hover { background: color-mix(in srgb, var(--uui-color-selected) 8%, transparent); color: var(--uui-color-text); }
    .utm-tabs button:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    @container (max-width: 62rem) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .breakdown-card, .wide { grid-column: auto; }
      .document-flags-card { inline-size: 100%; }
    }
    @container (max-width: 56rem) {
      .grid { grid-template-columns: 1fr; }
      .document-flags-card { grid-column: 1 / -1; }
    }
  `];
}

declare global { interface HTMLElementTagNameMap { "vercel-analytics-breakdown-grid": VercelAnalyticsBreakdownGridElement; } }
