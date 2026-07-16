import {
  LitElement,
  css,
  customElement,
  html,
  property,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { UUIInputElement, UUISelectElement } from "@umbraco-cms/backoffice/external/uui";
import { UmbracoVercelAnalyticsService } from "../api/sdk.gen.js";
import type {
  AnalyticsBreakdown,
  AnalyticsConnectionSummary,
  AnalyticsDimension,
  AnalyticsDocumentRoute,
  AnalyticsSummary,
} from "../api/types.gen.js";
import { dateRangeForPreset, normalizeCustomRange, type AnalyticsDateRange, type DatePreset } from "./date-range.js";
import { reportErrorMessage } from "./report-error.js";
import { detectUtmCapability, isUtmDimension, type UtmCapability } from "./utm-capability.js";
import { topBreakdownRows } from "./breakdown-rows.js";
import "./history-chart.element.js";
import "./breakdown-table.element.js";
import "./breakdown-dialog.element.js";

type BreakdownState = { data?: AnalyticsBreakdown; error?: string; loading: boolean };
type ReportScope = { documentId?: string; culture?: string; path?: string };
type ExpandedBreakdown = {
  dimension: AnalyticsDimension;
  headline: string;
  rows: AnalyticsBreakdown["rows"];
  loading: boolean;
  error?: string;
};

const BREAKDOWNS: ReadonlyArray<{ dimension: AnalyticsDimension; headline: string; wide?: boolean; planLimited?: boolean }> = [
  { dimension: "RequestPath", headline: "Pages and routes", wide: true },
  { dimension: "ReferrerHostname", headline: "Referrers", wide: true },
  { dimension: "Country", headline: "Countries" },
  { dimension: "DeviceType", headline: "Devices" },
  { dimension: "BrowserName", headline: "Browsers" },
  { dimension: "OsName", headline: "Operating systems" },
  { dimension: "UtmSource", headline: "UTM sources", planLimited: true },
  { dimension: "UtmMedium", headline: "UTM media", planLimited: true },
  { dimension: "UtmCampaign", headline: "UTM campaigns", planLimited: true },
];

@customElement("vercel-analytics-dashboard")
export class VercelAnalyticsDashboardElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) documentId?: string;
  @property() culture?: string;

  @state() private _connections: AnalyticsConnectionSummary[] = [];
  @state() private _connection?: string;
  @state() private _routes: AnalyticsDocumentRoute[] = [];
  @state() private _route?: AnalyticsDocumentRoute;
  @state() private _range: AnalyticsDateRange = dateRangeForPreset(30);
  @state() private _preset: DatePreset = 30;
  @state() private _summary?: AnalyticsSummary;
  @state() private _summaryLoading = true;
  @state() private _summaryError?: string;
  @state() private _breakdowns: Partial<Record<AnalyticsDimension, BreakdownState>> = {};
  @state() private _metric: "visitors" | "pageViews" = "visitors";
  @state() private _configurationError?: string;
  @state() private _utmCapability: UtmCapability = "unknown";
  @state() private _expanded?: ExpandedBreakdown;
  #initializationRequest = 0;
  #reportRequest = 0;
  #expandedRequest = 0;
  #lastScopeKey?: string;
  #utmCapabilityByConnection = new Map<string, UtmCapability>();

  connectedCallback(): void {
    super.connectedCallback();
    void this.#initialize();
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>): void {
    if ((changedProperties.has("documentId") || changedProperties.has("culture")) &&
        this.#lastScopeKey !== this.#currentScopeKey()) {
      void this.#initialize();
    }
  }

  #currentScopeKey(): string {
    return this.documentId ? `${this.documentId}:${this.culture ?? ""}` : "global";
  }

  async #initialize(): Promise<void> {
    const request = ++this.#initializationRequest;
    this.#lastScopeKey = this.#currentScopeKey();
    this._configurationError = undefined;
    if (this.documentId) {
      const { data, error } = await UmbracoVercelAnalyticsService.documentRoutes({
        path: { documentId: this.documentId },
        query: { culture: this.culture },
      });
      if (request !== this.#initializationRequest) return;
      if (error || !data?.length) {
        this._configurationError = "This document is unpublished, unmapped, or its document type is not enabled for analytics.";
        this._summaryLoading = false;
        return;
      }
      this._routes = data;
      this._route = data.find((route) => route.isCurrent) ?? data[0];
      this._connection = this._route.connection;
    } else {
      const { data, error } = await UmbracoVercelAnalyticsService.connections();
      if (request !== this.#initializationRequest) return;
      if (error || !data?.enabled) {
        this._configurationError = "Vercel Analytics is disabled or unavailable. Ask an administrator to configure a connection.";
        this._summaryLoading = false;
        return;
      }
      this._connections = data.connections;
      const defaultDays = data.defaultRangeDays;
      if ([7, 30, 90, 365].includes(defaultDays)) {
        this._preset = defaultDays as Exclude<DatePreset, "custom">;
      } else {
        this._preset = "custom";
      }
      this._range = dateRangeForPreset(defaultDays);
      const stored = localStorage.getItem("umbraco-vercel-analytics:connection");
      this._connection = data.connections.some((item) => item.alias === stored)
        ? stored ?? undefined
        : data.defaultConnection ?? data.connections[0]?.alias;
    }
    await this.#loadReports();
  }

  #scope(): ReportScope {
    return this.documentId && this._route
      ? { documentId: this.documentId, culture: this._route.culture, path: this._route.path }
      : {};
  }

  async #loadReports(): Promise<void> {
    if (!this._connection) return;
    this._expanded = undefined;
    const request = ++this.#reportRequest;
    this._summaryLoading = true;
    this._summaryError = undefined;
    this._summary = undefined;
    this._utmCapability = this.#utmCapabilityByConnection.get(this._connection) ?? "unknown";
    const requestedBreakdowns = BREAKDOWNS.filter(({ planLimited }) => !planLimited || this._utmCapability !== "unavailable");
    this._breakdowns = Object.fromEntries(requestedBreakdowns.map(({ dimension }) => [dimension, { loading: true }])) as typeof this._breakdowns;
    let baselineSucceeded = false;
    let utmSucceeded = false;
    const utmStatuses: number[] = [];

    const query = { connection: this._connection, ...this._range, ...this.#scope() };
    const summaryPromise = UmbracoVercelAnalyticsService.summary({ query }).then(({ data, error, response }) => {
      if (request !== this.#reportRequest) return;
      this._summaryLoading = false;
      if (error) this._summaryError = reportErrorMessage({ status: response.status });
      else {
        this._summary = data;
        baselineSucceeded = true;
      }
    });

    const breakdownPromises = requestedBreakdowns.map(async ({ dimension }) => {
      const { data, error, response } = await UmbracoVercelAnalyticsService.breakdown({
        path: { dimension },
        query: { ...query, limit: 11 },
      });
      if (request !== this.#reportRequest) return;
      if (isUtmDimension(dimension)) {
        if (error) utmStatuses.push(response.status);
        else utmSucceeded = true;
      } else if (!error) {
        baselineSucceeded = true;
      }
      this._breakdowns = {
        ...this._breakdowns,
        [dimension]: error
          ? { loading: false, error: reportErrorMessage({ status: response.status }) }
          : { loading: false, data },
      };
    });
    await Promise.allSettled([summaryPromise, ...breakdownPromises]);
    if (request !== this.#reportRequest) return;
    const detectedCapability = detectUtmCapability(baselineSucceeded, utmSucceeded, utmStatuses);
    if (detectedCapability !== "unknown") {
      this.#utmCapabilityByConnection.set(this._connection, detectedCapability);
      this._utmCapability = detectedCapability;
    }
  }

  #linkBaseUrl(): string | undefined {
    if (this._route?.url) {
      try {
        return new URL(this._route.url).origin;
      } catch {
        return `https://${this._route.hostname}`;
      }
    }

    const hostname = this._connections.find((item) => item.alias === this._connection)?.hostnames[0];
    return hostname ? `https://${hostname}` : undefined;
  }

  async #openBreakdown(dimension: AnalyticsDimension, headline: string): Promise<void> {
    if (!this._connection) return;
    const request = ++this.#expandedRequest;
    this._expanded = { dimension, headline, rows: [], loading: true };
    const { data, error, response } = await UmbracoVercelAnalyticsService.breakdown({
      path: { dimension },
      query: {
        connection: this._connection,
        ...this._range,
        ...this.#scope(),
        limit: 100,
      },
    });
    if (request !== this.#expandedRequest || this._expanded?.dimension !== dimension) return;
    this._expanded = error
      ? { dimension, headline, rows: [], loading: false, error: reportErrorMessage({ status: response.status }) }
      : { dimension, headline, rows: data?.rows ?? [], loading: false };
  }

  #closeBreakdown(): void {
    this.#expandedRequest++;
    this._expanded = undefined;
  }

  #selectOptions(items: Array<{ value: string; name: string }>, selected?: string) {
    return items.map((item) => ({ ...item, selected: item.value === selected }));
  }

  #onConnectionChange(event: Event): void {
    this._connection = (event.target as UUISelectElement).value as string;
    localStorage.setItem("umbraco-vercel-analytics:connection", this._connection);
    void this.#loadReports();
  }

  #onRouteChange(event: Event): void {
    const path = (event.target as UUISelectElement).value as string;
    this._route = this._routes.find((route) => `${route.culture}|${route.hostname}|${route.path}` === path);
    this._connection = this._route?.connection;
    void this.#loadReports();
  }

  #onPresetChange(event: Event): void {
    const value = (event.target as UUISelectElement).value as string;
    this._preset = value === "custom" ? "custom" : Number(value) as Exclude<DatePreset, "custom">;
    if (this._preset !== "custom") {
      this._range = dateRangeForPreset(this._preset);
      void this.#loadReports();
    }
  }

  #onCustomDate(field: "from" | "to", event: Event): void {
    const value = (event.target as UUIInputElement).value as string;
    const normalized = normalizeCustomRange(field === "from" ? value : this._range.from, field === "to" ? value : this._range.to);
    if (normalized) this._range = normalized;
  }

  #renderHeader() {
    const connection = this._connections.find((item) => item.alias === this._connection);
    return html`
      <header>
        <div>
          <h1>Analytics</h1>
          <p>Vercel Web Analytics for published production traffic.</p>
        </div>
        <div class="controls">
          ${this.documentId ? html`
            <uui-select
              label="Published route"
              .options=${this.#selectOptions(this._routes.map((route) => ({
                value: `${route.culture}|${route.hostname}|${route.path}`,
                name: `${route.culture} · ${route.hostname}${route.path}`,
              })), this._route ? `${this._route.culture}|${this._route.hostname}|${this._route.path}` : undefined)}
              @change=${this.#onRouteChange}></uui-select>
          ` : html`
            <uui-select
              label="Vercel project"
              .options=${this.#selectOptions(this._connections.map((item) => ({ value: item.alias, name: item.displayName })), this._connection)}
              @change=${this.#onConnectionChange}></uui-select>
          `}
          <uui-select
            label="Date range"
            .options=${this.#selectOptions([
              { value: "7", name: "Last 7 days" }, { value: "30", name: "Last 30 days" },
              { value: "90", name: "Last 90 days" }, { value: "365", name: "Last 12 months" },
              { value: "custom", name: "Custom range" },
            ], String(this._preset))}
            @change=${this.#onPresetChange}></uui-select>
          <uui-button look="primary" label="Refresh analytics" @click=${this.#loadReports}>Refresh</uui-button>
        </div>
      </header>
      ${this._preset === "custom" ? html`
        <div class="custom-range">
          <uui-form-layout-item><uui-label slot="label" for="analytics-from">From</uui-label><uui-input id="analytics-from" type="date" .value=${this._range.from} @change=${(event: Event) => this.#onCustomDate("from", event)}></uui-input></uui-form-layout-item>
          <uui-form-layout-item><uui-label slot="label" for="analytics-to">To</uui-label><uui-input id="analytics-to" type="date" .value=${this._range.to} @change=${(event: Event) => this.#onCustomDate("to", event)}></uui-input></uui-form-layout-item>
          <uui-button look="secondary" label="Apply custom date range" @click=${this.#loadReports}>Apply dates</uui-button>
        </div>
      ` : ""}
      ${connection?.warnings.map((warning) => html`<uui-tag color="warning">${warning}</uui-tag>`)}
      ${this._route?.warnings.map((warning) => html`<uui-tag color="warning">${warning}</uui-tag>`)}
    `;
  }

  #renderSummary() {
    if (this._summaryLoading) return html`<uui-loader-bar aria-label="Loading summary"></uui-loader-bar>`;
    if (this._summaryError) return html`<uui-box><umb-empty-state headline="Analytics unavailable"><p>${this._summaryError}</p><uui-button look="secondary" label="Retry analytics summary" @click=${this.#loadReports}>Retry</uui-button></umb-empty-state></uui-box>`;
    if (!this._summary) return "";
    return html`
      <section class="summary" aria-label="Traffic summary">
        <uui-box><span class="eyebrow">Visitors</span><strong>${this._summary.totals.visitors.toLocaleString()}</strong></uui-box>
        <uui-box><span class="eyebrow">Page views</span><strong>${this._summary.totals.pageViews.toLocaleString()}</strong></uui-box>
      </section>
      <uui-box headline="History" class="history">
        <uui-tab-group slot="header-actions" aria-label="History metric">
          <uui-tab label="Visitors" .active=${this._metric === "visitors"} @click=${() => (this._metric = "visitors")}>Visitors</uui-tab>
          <uui-tab label="Page views" .active=${this._metric === "pageViews"} @click=${() => (this._metric = "pageViews")}>Page views</uui-tab>
        </uui-tab-group>
        ${this._summary.points.length
          ? html`<vercel-analytics-history-chart .points=${this._summary.points} .metric=${this._metric} .interval=${this._range.interval}></vercel-analytics-history-chart>`
          : html`<umb-empty-state headline="No history"><p>No traffic was recorded in this period.</p></umb-empty-state>`}
      </uui-box>
    `;
  }

  #renderBreakdown(dimension: AnalyticsDimension, headline: string, wide = false, planLimited = false) {
    if (planLimited && this._utmCapability === "unavailable") return "";
    const state = this._breakdowns[dimension];
    const rows = topBreakdownRows(state?.data?.rows ?? []);
    const linkValues = dimension === "RequestPath" || dimension === "Route";
    return html`
      <uui-box headline=${headline} class=${wide ? "wide" : ""}>
        ${!state?.loading && !state?.error && rows.length ? html`
          <uui-button
            slot="header-actions"
            look="secondary"
            label=${`View all ${headline}`}
            @click=${() => this.#openBreakdown(dimension, headline)}>View all</uui-button>
        ` : ""}
        ${state?.loading ? html`<uui-loader-bar aria-label=${`Loading ${headline}`}></uui-loader-bar>` : ""}
        ${!state?.loading ? html`
          <vercel-analytics-breakdown-table
            .headline=${headline}
            .rows=${rows}
            .baseUrl=${this.#linkBaseUrl()}
            .linkValues=${linkValues}
            .unavailable=${state?.error}></vercel-analytics-breakdown-table>
          ${state?.error ? html`<uui-button look="secondary" label=${`Retry ${headline} report`} @click=${this.#loadReports}>Retry</uui-button>` : ""}
          ${planLimited && state?.error ? html`<p class="hint">UTM reporting availability depends on your Vercel plan and reporting window.</p>` : ""}
        ` : ""}
      </uui-box>
    `;
  }

  render() {
    if (this._configurationError) return html`<main><umb-empty-state headline="Analytics is not available"><p>${this._configurationError}</p></umb-empty-state></main>`;
    return html`
      <main>
        ${this.#renderHeader()}
        ${this.#renderSummary()}
        <section class="grid" aria-label="Traffic breakdowns">
          ${BREAKDOWNS.map((item) => this.#renderBreakdown(item.dimension, item.headline, item.wide, item.planLimited))}
        </section>
        ${this._expanded ? html`
          <vercel-analytics-breakdown-dialog
            .headline=${this._expanded.headline}
            .rows=${this._expanded.rows}
            .loading=${this._expanded.loading}
            .unavailable=${this._expanded.error}
            .baseUrl=${this.#linkBaseUrl()}
            .linkValues=${this._expanded.dimension === "RequestPath" || this._expanded.dimension === "Route"}
            @close-breakdown=${this.#closeBreakdown}></vercel-analytics-breakdown-dialog>
        ` : ""}
      </main>
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { display: block; }
    main { padding: var(--uui-size-layout-1); max-width: 110rem; margin-inline: auto; }
    header { display: flex; align-items: end; justify-content: space-between; gap: var(--uui-size-layout-1); margin-bottom: var(--uui-size-layout-1); }
    h1 { margin: 0; font-size: var(--uui-type-h1-size); }
    header p, .hint { color: var(--uui-color-text-alt); }
    .controls, .custom-range { display: flex; align-items: end; flex-wrap: wrap; gap: var(--uui-size-space-4); }
    .custom-range { justify-content: flex-end; margin-bottom: var(--uui-size-layout-1); }
    .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--uui-size-layout-1); margin-bottom: var(--uui-size-layout-1); }
    .summary strong { display: block; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.1; margin-top: var(--uui-size-space-3); font-variant-numeric: tabular-nums; }
    .eyebrow { color: var(--uui-color-text-alt); font-weight: 700; }
    .history { margin-bottom: var(--uui-size-layout-1); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--uui-size-layout-1); }
    .wide { grid-column: span 2; }
    uui-tag { margin: 0 var(--uui-size-space-3) var(--uui-size-space-5) 0; }
    @media (max-width: 900px) {
      header { align-items: stretch; flex-direction: column; }
      .grid, .summary { grid-template-columns: 1fr; }
      .wide { grid-column: auto; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; } }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-dashboard": VercelAnalyticsDashboardElement;
  }
}
