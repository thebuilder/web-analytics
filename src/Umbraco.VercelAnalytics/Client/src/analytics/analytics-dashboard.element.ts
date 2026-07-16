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
  AnalyticsEventHistory,
  AnalyticsEventRow,
  AnalyticsEventsReport,
  AnalyticsSummary,
} from "../api/types.gen.js";
import { dateRangeForPreset, inclusiveRangeDays, normalizeCustomRange, type AnalyticsDateRange, type DatePreset } from "./date-range.js";
import { reportErrorMessage } from "./report-error.js";
import { detectUtmCapability, isUtmDimension, type UtmCapability } from "./utm-capability.js";
import { topBreakdownRows, type TrafficMetric } from "./breakdown-rows.js";
import { countrySearchValue } from "./country-display.js";
import { metricComparison } from "./metric-comparison.js";
import { activeDocumentRoute } from "./document-route.js";
import { topEventRows, visibleEventRows } from "./event-rows.js";
import "./history-chart.element.js";
import "./breakdown-table.element.js";
import "./breakdown-dialog.element.js";
import "./event-table.element.js";
import "./event-dialog.element.js";
import "./event-history-dialog.element.js";

type BreakdownState = { data?: AnalyticsBreakdown; error?: string; loading: boolean };
type EventState = { data?: AnalyticsEventsReport; loading: boolean };
type ReportScope = { documentId?: string; culture?: string; path?: string };
type ExpandedBreakdown = {
  dimension: AnalyticsDimension;
  headline: string;
  rows: AnalyticsBreakdown["rows"];
  loading: boolean;
  error?: string;
};
type ExpandedEvents = { rows: AnalyticsEventRow[]; loading: boolean; error?: string };
type SelectedEvent = { eventName: string; history?: AnalyticsEventHistory; loading: boolean; error?: string };

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
  @state() private _route?: AnalyticsDocumentRoute;
  @state() private _range: AnalyticsDateRange = dateRangeForPreset(30);
  @state() private _preset: DatePreset = 30;
  @state() private _summary?: AnalyticsSummary;
  @state() private _summaryLoading = true;
  @state() private _summaryError?: string;
  @state() private _breakdowns: Partial<Record<AnalyticsDimension, BreakdownState>> = {};
  @state() private _metric: TrafficMetric = "visitors";
  @state() private _audienceDimension: "DeviceType" | "BrowserName" = "DeviceType";
  @state() private _configurationError?: string;
  @state() private _utmCapability: UtmCapability = "unknown";
  @state() private _expanded?: ExpandedBreakdown;
  @state() private _events: EventState = { loading: true };
  @state() private _expandedEvents?: ExpandedEvents;
  @state() private _selectedEvent?: SelectedEvent;
  #initializationRequest = 0;
  #reportRequest = 0;
  #expandedRequest = 0;
  #expandedAbort?: AbortController;
  #expandedSearchTimer?: number;
  #eventAbort?: AbortController;
  #eventSearchTimer?: number;
  #eventRequest = 0;
  #lastScopeKey?: string;
  #utmCapabilityByConnection = new Map<string, UtmCapability>();

  connectedCallback(): void {
    super.connectedCallback();
    void this.#initialize();
  }

  override disconnectedCallback(): void {
    this.#expandedAbort?.abort();
    this.#eventAbort?.abort();
    if (this.#expandedSearchTimer !== undefined) window.clearTimeout(this.#expandedSearchTimer);
    if (this.#eventSearchTimer !== undefined) window.clearTimeout(this.#eventSearchTimer);
    super.disconnectedCallback();
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
      const route = activeDocumentRoute(data, this.culture);
      if (!route) {
        this._configurationError = "The active culture does not have a published route configured for analytics.";
        this._summaryLoading = false;
        return;
      }
      this._route = route;
      this._connection = route.connection;
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

  #availableBreakdowns() {
    return this.documentId
      ? BREAKDOWNS.filter(({ dimension }) => dimension !== "RequestPath" && dimension !== "Route")
      : BREAKDOWNS;
  }

  async #loadReports(): Promise<void> {
    if (!this._connection) return;
    this._expanded = undefined;
    this._expandedEvents = undefined;
    this._selectedEvent = undefined;
    const request = ++this.#reportRequest;
    this._summaryLoading = true;
    this._summaryError = undefined;
    this._summary = undefined;
    this._utmCapability = this.#utmCapabilityByConnection.get(this._connection) ?? "unknown";
    const requestedBreakdowns = this.#availableBreakdowns().filter(({ planLimited }) => !planLimited || this._utmCapability !== "unavailable");
    this._breakdowns = Object.fromEntries(requestedBreakdowns.map(({ dimension }) => [dimension, { loading: true }])) as typeof this._breakdowns;
    this._events = { loading: true };
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
    const eventsPromise = UmbracoVercelAnalyticsService.events({ query: { ...query, limit: 20 } }).then(({ data, error }) => {
      if (request !== this.#reportRequest) return;
      this._events = error ? { loading: false } : { loading: false, data };
    });
    await Promise.allSettled([summaryPromise, eventsPromise, ...breakdownPromises]);
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
    if (this.#expandedSearchTimer !== undefined) window.clearTimeout(this.#expandedSearchTimer);
    await this.#loadExpandedBreakdown(dimension, headline, "");
  }

  async #loadExpandedBreakdown(dimension: AnalyticsDimension, headline: string, search: string): Promise<void> {
    if (!this._connection) return;
    this.#expandedAbort?.abort();
    const abort = new AbortController();
    this.#expandedAbort = abort;
    const request = ++this.#expandedRequest;
    this._expanded = { dimension, headline, rows: [], loading: true };
    let result;
    try {
      result = await UmbracoVercelAnalyticsService.breakdown({
        path: { dimension },
        query: {
          connection: this._connection,
          ...this._range,
          ...this.#scope(),
          limit: 100,
          search: search || undefined,
        },
        signal: abort.signal,
      });
    } catch (error) {
      if (abort.signal.aborted) return;
      if (request === this.#expandedRequest && this._expanded?.dimension === dimension) {
        this._expanded = { dimension, headline, rows: [], loading: false, error: reportErrorMessage(error) };
      }
      return;
    }
    const { data, error, response } = result;
    if (request !== this.#expandedRequest || this._expanded?.dimension !== dimension) return;
    this._expanded = error
      ? { dimension, headline, rows: [], loading: false, error: reportErrorMessage({ status: response.status }) }
      : { dimension, headline, rows: data?.rows ?? [], loading: false };
  }

  #searchBreakdown(event: CustomEvent<{ search: string }>): void {
    if (!this._expanded) return;
    const { dimension, headline } = this._expanded;
    const search = dimension === "Country"
      ? countrySearchValue(event.detail.search, navigator.languages)
      : event.detail.search;
    this.#expandedAbort?.abort();
    this.#expandedRequest++;
    this._expanded = { dimension, headline, rows: [], loading: true };
    if (this.#expandedSearchTimer !== undefined) window.clearTimeout(this.#expandedSearchTimer);
    this.#expandedSearchTimer = window.setTimeout(() => {
      void this.#loadExpandedBreakdown(dimension, headline, search);
    }, 300);
  }

  #closeBreakdown(): void {
    if (this.#expandedSearchTimer !== undefined) window.clearTimeout(this.#expandedSearchTimer);
    this.#expandedAbort?.abort();
    this.#expandedRequest++;
    this._expanded = undefined;
  }

  async #loadExpandedEvents(search = ""): Promise<void> {
    if (!this._connection) return;
    this.#eventAbort?.abort();
    const abort = new AbortController();
    this.#eventAbort = abort;
    const request = ++this.#eventRequest;
    this._expandedEvents = { rows: [], loading: true };
    try {
      const { data, error, response } = await UmbracoVercelAnalyticsService.events({
        query: { connection: this._connection, ...this._range, ...this.#scope(), limit: 100, search: search || undefined },
        signal: abort.signal,
      });
      if (request !== this.#eventRequest) return;
      this._expandedEvents = error
        ? { rows: [], loading: false, error: reportErrorMessage({ status: response.status }) }
        : { rows: visibleEventRows(data?.rows ?? []), loading: false };
    } catch (error) {
      if (!abort.signal.aborted && request === this.#eventRequest) {
        this._expandedEvents = { rows: [], loading: false, error: reportErrorMessage(error) };
      }
    }
  }

  #searchEvents(event: CustomEvent<{ search: string }>): void {
    this.#eventAbort?.abort();
    this.#eventRequest++;
    this._expandedEvents = { rows: [], loading: true };
    if (this.#eventSearchTimer !== undefined) window.clearTimeout(this.#eventSearchTimer);
    this.#eventSearchTimer = window.setTimeout(() => void this.#loadExpandedEvents(event.detail.search), 300);
  }

  #closeEvents(): void {
    this.#eventAbort?.abort();
    this.#eventRequest++;
    this._expandedEvents = undefined;
  }

  async #selectEvent(event: CustomEvent<{ eventName: string }>): Promise<void> {
    if (!this._connection) return;
    this.#closeEvents();
    const eventName = event.detail.eventName;
    const request = ++this.#eventRequest;
    this._selectedEvent = { eventName, loading: true };
    const { data, error, response } = await UmbracoVercelAnalyticsService.eventHistory({
      query: { connection: this._connection, ...this._range, ...this.#scope(), eventName },
    });
    if (request !== this.#eventRequest || this._selectedEvent?.eventName !== eventName) return;
    this._selectedEvent = error
      ? { eventName, loading: false, error: reportErrorMessage({ status: response.status }) }
      : { eventName, loading: false, history: data };
  }

  #closeEventHistory(): void {
    this.#eventRequest++;
    this._selectedEvent = undefined;
  }

  #selectOptions(items: Array<{ value: string; name: string }>, selected?: string) {
    return items.map((item) => ({ ...item, selected: item.value === selected }));
  }

  #onConnectionChange(event: Event): void {
    this._connection = (event.target as UUISelectElement).value as string;
    localStorage.setItem("umbraco-vercel-analytics:connection", this._connection);
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

  #onMetricKeydown(event: KeyboardEvent): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from((event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? []);
    const currentIndex = tabs.indexOf(event.currentTarget as HTMLButtonElement);
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
    const target = tabs[targetIndex];
    target?.click();
    target?.focus();
  }

  #renderHeader() {
    const connection = this._connections.find((item) => item.alias === this._connection);
    return html`
      <header>
        <div class="controls">
          ${this.documentId ? "" : html`
            <uui-select
              class="project-select"
              label="Vercel project"
              .options=${this.#selectOptions(this._connections.map((item) => ({ value: item.alias, name: item.displayName })), this._connection)}
              @change=${this.#onConnectionChange}></uui-select>
          `}
          <div class="report-controls">
            <uui-select
              class="range-select"
              label="Date range"
              .options=${this.#selectOptions([
                { value: "7", name: "Last 7 days" }, { value: "30", name: "Last 30 days" },
                { value: "90", name: "Last 90 days" }, { value: "365", name: "Last 12 months" },
                { value: "custom", name: "Custom range" },
              ], String(this._preset))}
              @change=${this.#onPresetChange}></uui-select>
            ${this._preset === "custom" ? html`
              <div class="date-actions">
                <div class="date-control">
                  <uui-label for="analytics-from">From</uui-label>
                  <uui-input id="analytics-from" label="From" type="date" .value=${this._range.from} @change=${(event: Event) => this.#onCustomDate("from", event)}></uui-input>
                </div>
                <div class="date-control">
                  <uui-label for="analytics-to">To</uui-label>
                  <uui-input id="analytics-to" label="To" type="date" .value=${this._range.to} @change=${(event: Event) => this.#onCustomDate("to", event)}></uui-input>
                </div>
                <uui-button look="primary" label="Apply custom date range" @click=${this.#loadReports}>Apply dates</uui-button>
              </div>
            ` : html`
              <uui-button look="primary" label="Refresh analytics" @click=${this.#loadReports}>Refresh</uui-button>
            `}
          </div>
        </div>
      </header>
      <div class="warnings">
        ${connection?.warnings.map((warning) => html`<uui-tag color="warning">${warning}</uui-tag>`)}
        ${this._route?.warnings.map((warning) => html`<uui-tag color="warning">${warning}</uui-tag>`)}
      </div>
    `;
  }

  #renderSummary() {
    if (this._summaryError) return html`
      <uui-box class="summary-error">
        <div class="summary-error-content" role="status">
          <uui-icon name="icon-alert" aria-hidden="true"></uui-icon>
          <div class="summary-error-copy">
            <strong>Analytics unavailable</strong>
            <p>${this._summaryError}</p>
          </div>
          <uui-button look="secondary" label="Retry analytics summary" @click=${this.#loadReports}>Retry</uui-button>
        </div>
      </uui-box>
    `;
    const periodDays = inclusiveRangeDays(this._range);
    const visitorsComparison = metricComparison(
      this._summary?.totals.visitors ?? 0,
      this._summary?.previousTotals?.visitors,
      "visitors",
      periodDays,
    );
    const pageViewsComparison = metricComparison(
      this._summary?.totals.pageViews ?? 0,
      this._summary?.previousTotals?.pageViews,
      "page views",
      periodDays,
    );
    return html`
      <uui-box class="history" aria-busy=${this._summaryLoading ? "true" : "false"}>
        <div class="metric-tabs" role="tablist" aria-label="Traffic metric">
          <button
            id="metric-visitors-tab"
            class="metric-tab"
            type="button"
            role="tab"
            aria-controls="history-panel"
            aria-selected=${this._metric === "visitors"}
            tabindex=${this._metric === "visitors" ? 0 : -1}
            @click=${() => (this._metric = "visitors")}
            @keydown=${this.#onMetricKeydown}>
            <span class="eyebrow">Visitors</span>
            ${this._summaryLoading
              ? html`<span class="metric-skeleton" aria-hidden="true"></span>`
              : html`<span class="metric-value">
                  <strong>${this._summary?.totals.visitors.toLocaleString()}</strong>
                  ${this.#renderComparison(visitorsComparison)}
                </span>`}
          </button>
          <button
            id="metric-page-views-tab"
            class="metric-tab"
            type="button"
            role="tab"
            aria-controls="history-panel"
            aria-selected=${this._metric === "pageViews"}
            tabindex=${this._metric === "pageViews" ? 0 : -1}
            @click=${() => (this._metric = "pageViews")}
            @keydown=${this.#onMetricKeydown}>
            <span class="eyebrow">Page views</span>
            ${this._summaryLoading
              ? html`<span class="metric-skeleton" aria-hidden="true"></span>`
              : html`<span class="metric-value">
                  <strong>${this._summary?.totals.pageViews.toLocaleString()}</strong>
                  ${this.#renderComparison(pageViewsComparison)}
                </span>`}
          </button>
        </div>
        <div
          id="history-panel"
          class="history-panel"
          role="tabpanel"
          aria-labelledby=${this._metric === "visitors" ? "metric-visitors-tab" : "metric-page-views-tab"}>
          ${this._summaryLoading ? html`
            <span class="visually-hidden" role="status">Loading traffic summary and history</span>
            <div class="chart-skeleton" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </div>
            <span class="history-button-skeleton" aria-hidden="true"></span>
          ` : this._summary?.points.length
              ? html`<vercel-analytics-history-chart .points=${this._summary.points} .metric=${this._metric} .interval=${this._range.interval}></vercel-analytics-history-chart>`
              : html`<umb-empty-state headline="No history"><p>No traffic was recorded in this period.</p></umb-empty-state>`}
        </div>
      </uui-box>
    `;
  }

  #renderComparison(comparison: ReturnType<typeof metricComparison>) {
    if (!comparison) return "";
    return html`
      <span class=${`comparison ${comparison.direction}`} title=${comparison.description}>
        <span aria-hidden="true">${comparison.display}</span>
        <span class="visually-hidden">${comparison.description}</span>
      </span>
    `;
  }

  #renderBreakdown(
    dimension: AnalyticsDimension,
    headline: string,
    wide = false,
    planLimited = false,
    audienceTabs = false,
  ) {
    if (planLimited && this._utmCapability === "unavailable") return "";
    const state = this._breakdowns[dimension];
    const loading = state?.loading ?? true;
    const rows = topBreakdownRows(state?.data?.rows ?? [], 10);
    const linkValues = dimension === "RequestPath" || dimension === "Route";
    const total = this._summary?.totals[this._metric] ?? 0;
    return html`
      <uui-box class=${`breakdown-card ${wide ? "wide" : ""}`}>
        <div class="breakdown-card-layout">
          <vercel-analytics-breakdown-table
            .headline=${headline}
            .dimension=${dimension}
            .metric=${this._metric}
            .total=${total}
            .rows=${rows}
            .loading=${loading}
            .baseUrl=${this.#linkBaseUrl()}
            .linkValues=${linkValues}
            .unavailable=${state?.error}>
            ${audienceTabs ? html`
              <div slot="heading" class="breakdown-tabs" role="tablist" aria-label="Audience technology">
                <button
                  type="button"
                  role="tab"
                  aria-selected=${this._audienceDimension === "DeviceType"}
                  tabindex=${this._audienceDimension === "DeviceType" ? 0 : -1}
                  @click=${() => (this._audienceDimension = "DeviceType")}
                  @keydown=${this.#onMetricKeydown}>Devices</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected=${this._audienceDimension === "BrowserName"}
                  tabindex=${this._audienceDimension === "BrowserName" ? 0 : -1}
                  @click=${() => (this._audienceDimension = "BrowserName")}
                  @keydown=${this.#onMetricKeydown}>Browsers</button>
              </div>
            ` : ""}
          </vercel-analytics-breakdown-table>
          ${planLimited && state?.error ? html`<p class="hint breakdown-hint">UTM reporting availability depends on your Vercel plan and reporting window.</p>` : ""}
          <footer class="breakdown-footer">
            ${!loading && !state?.error && rows.length ? html`
              <uui-button
                look="secondary"
                label=${`View all ${headline}`}
                @click=${() => this.#openBreakdown(dimension, headline)}>View all</uui-button>
            ` : ""}
            ${!loading && state?.error ? html`
              <uui-button look="secondary" label=${`Retry ${headline} report`} @click=${this.#loadReports}>Retry</uui-button>
            ` : ""}
          </footer>
        </div>
      </uui-box>
    `;
  }

  #renderBreakdownItem(item: (typeof BREAKDOWNS)[number]) {
    if (item.dimension === "BrowserName") return "";
    if (item.dimension === "DeviceType") {
      const dimension = this._audienceDimension;
      return this.#renderBreakdown(
        dimension,
        dimension === "DeviceType" ? "Devices" : "Browsers",
        item.wide,
        item.planLimited,
        true,
      );
    }
    return this.#renderBreakdown(item.dimension, item.headline, item.wide, item.planLimited);
  }

  #renderEvents() {
    const rows = topEventRows(this._events.data?.rows ?? [], 10);
    if (!this._events.loading && rows.length === 0) return "";
    return html`
      <uui-box class="breakdown-card wide">
        <div class="breakdown-card-layout">
          <vercel-analytics-event-table .rows=${rows} .loading=${this._events.loading} @select-event=${this.#selectEvent}></vercel-analytics-event-table>
          <footer class="breakdown-footer">
            ${!this._events.loading && rows.length ? html`<uui-button look="secondary" label="View all events" @click=${() => this.#loadExpandedEvents()}>View all</uui-button>` : ""}
          </footer>
        </div>
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
          ${this.#availableBreakdowns().filter(({ dimension }) => !isUtmDimension(dimension)).map((item) => this.#renderBreakdownItem(item))}
          ${this.#renderEvents()}
          ${this.#availableBreakdowns().filter(({ dimension }) => isUtmDimension(dimension)).map((item) => this.#renderBreakdownItem(item))}
        </section>
        ${this._expanded ? html`
          <vercel-analytics-breakdown-dialog
            .headline=${this._expanded.headline}
            .dimension=${this._expanded.dimension}
            .rows=${this._expanded.rows}
            .loading=${this._expanded.loading}
            .unavailable=${this._expanded.error}
            .metric=${this._metric}
            .total=${this._summary?.totals[this._metric] ?? 0}
            .baseUrl=${this.#linkBaseUrl()}
            .linkValues=${this._expanded.dimension === "RequestPath" || this._expanded.dimension === "Route"}
            @search-breakdown=${this.#searchBreakdown}
            @close-breakdown=${this.#closeBreakdown}></vercel-analytics-breakdown-dialog>
        ` : ""}
        ${this._expandedEvents ? html`
          <vercel-analytics-event-dialog
            .rows=${this._expandedEvents.rows}
            .loading=${this._expandedEvents.loading}
            .unavailable=${this._expandedEvents.error}
            @search-events=${this.#searchEvents}
            @select-event=${this.#selectEvent}
            @close-events=${this.#closeEvents}></vercel-analytics-event-dialog>
        ` : ""}
        ${this._selectedEvent ? html`
          <vercel-analytics-event-history-dialog
            .eventName=${this._selectedEvent.eventName}
            .history=${this._selectedEvent.history}
            .loading=${this._selectedEvent.loading}
            .unavailable=${this._selectedEvent.error}
            .interval=${this._range.interval}
            @close-event-history=${this.#closeEventHistory}></vercel-analytics-event-history-dialog>
        ` : ""}
      </main>
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { display: block; }
    main { container-type: inline-size; padding: var(--uui-size-layout-1); max-width: 110rem; margin-inline: auto; }
    header { margin-bottom: var(--uui-size-layout-1); }
    .hint { color: var(--uui-color-text-alt); }
    .controls { align-items: end; display: flex; flex-wrap: wrap; gap: var(--uui-size-layout-1); justify-content: flex-start; }
    .report-controls, .date-actions { align-items: end; display: flex; gap: var(--uui-size-space-4); }
    .date-control { display: grid; gap: var(--uui-size-space-2); }
    .date-control uui-input { min-inline-size: 11rem; }
    .project-select { min-inline-size: 10rem; }
    .range-select { min-inline-size: 12rem; }
    .metric-tabs { border-bottom: 1px solid var(--uui-color-border); display: flex; }
    .metric-tab { appearance: none; background: transparent; border: 0; border-bottom: 3px solid transparent; color: var(--uui-color-text); cursor: pointer; flex: 0 0 auto; font: inherit; inline-size: max-content; min-inline-size: 18rem; padding: var(--uui-size-space-5); text-align: left; }
    .metric-tab + .metric-tab { border-inline-start: 1px solid var(--uui-color-border); }
    .metric-tab[aria-selected="true"] { border-bottom-color: var(--uui-color-selected); }
    .metric-tab:hover { background: var(--uui-color-surface-alt); }
    .metric-tab:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .metric-value { align-items: center; display: flex; flex-wrap: nowrap; gap: var(--uui-size-space-4); margin-top: var(--uui-size-space-3); }
    .metric-tab strong { font-size: clamp(2rem, 3cqi, 3rem); line-height: 1.1; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .comparison { border-radius: var(--uui-border-radius); flex: 0 0 auto; font-weight: 700; padding: var(--uui-size-space-2) var(--uui-size-space-3); white-space: nowrap; }
    .comparison.increase { background: color-mix(in srgb, var(--uui-color-positive-standalone) 14%, var(--uui-color-surface)); color: var(--uui-color-positive-standalone); }
    .comparison.decrease { background: color-mix(in srgb, var(--uui-color-danger-standalone) 14%, var(--uui-color-surface)); color: var(--uui-color-danger-standalone); }
    .comparison.unchanged { background: var(--uui-color-surface-alt); color: var(--uui-color-text-alt); }
    .metric-skeleton { background: var(--uui-color-surface-alt); block-size: clamp(2.2rem, 4.4vw, 3.85rem); border-radius: var(--uui-border-radius); display: block; inline-size: 58%; margin-top: var(--uui-size-space-3); max-inline-size: 14rem; }
    .eyebrow { color: var(--uui-color-text-alt); font-weight: 700; }
    .history { --uui-box-default-padding: 0; margin-bottom: var(--uui-size-layout-1); overflow: hidden; }
    .history-panel { padding: var(--uui-size-space-5); }
    .chart-skeleton { block-size: 18rem; display: grid; margin-bottom: var(--uui-size-space-4); }
    .chart-skeleton span { border-top: 1px solid var(--uui-color-border); }
    .history-button-skeleton { background: var(--uui-color-surface-alt); block-size: 2.5rem; border-radius: var(--uui-border-radius); display: block; inline-size: 8.5rem; }
    .summary-error { --uui-box-default-padding: 0; --uui-box-border-width: 1px; --uui-box-border-color: color-mix(in srgb, var(--uui-color-warning-standalone) 35%, var(--uui-color-border)); --uui-box-box-shadow: none; margin-bottom: var(--uui-size-layout-1); overflow: hidden; }
    .summary-error-content { align-items: center; background: color-mix(in srgb, var(--uui-color-warning) 8%, var(--uui-color-surface)); border-inline-start: 3px solid var(--uui-color-warning-standalone); display: flex; flex-wrap: wrap; gap: var(--uui-size-space-5); padding: var(--uui-size-space-5); }
    .summary-error-content uui-icon { color: var(--uui-color-warning-standalone); font-size: 1.5rem; }
    .summary-error-copy { flex: 1 1 22rem; }
    .summary-error-copy p { color: var(--uui-color-text-alt); margin: var(--uui-size-space-1) 0 0; }
    .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--uui-size-layout-1); }
    .breakdown-card { --uui-box-default-padding: 0; grid-column: span 2; overflow: hidden; position: relative; }
    .breakdown-card-layout { box-sizing: border-box; min-block-size: 100%; padding-bottom: 3.75rem; }
    .breakdown-footer { align-items: center; background: color-mix(in srgb, var(--uui-color-surface-alt) 42%, var(--uui-color-surface)); border-top: 1px solid var(--uui-color-border); bottom: 0; box-sizing: border-box; display: flex; justify-content: flex-end; left: 0; min-block-size: 3.75rem; padding: var(--uui-size-space-2) var(--uui-size-space-4); position: absolute; right: 0; }
    .breakdown-hint { margin: 0; padding: var(--uui-size-space-3) var(--uui-size-space-5); }
    .breakdown-tabs { align-items: stretch; display: flex; margin: calc(-1 * var(--uui-size-space-3)); }
    .breakdown-tabs button { appearance: none; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--uui-color-text-alt); cursor: pointer; font: inherit; font-weight: 500; padding: calc(var(--uui-size-space-3) - 1px) var(--uui-size-space-3); }
    .breakdown-tabs button[aria-selected="true"] { border-bottom-color: var(--uui-color-selected); color: var(--uui-color-text); }
    .breakdown-tabs button:hover { background: var(--uui-color-surface-alt); }
    .breakdown-tabs button:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .wide { grid-column: span 3; }
    .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    .warnings { display: flex; flex-wrap: wrap; gap: var(--uui-size-space-3); margin-bottom: var(--uui-size-space-5); }
    .warnings:empty { display: none; }
    @container (max-width: 62rem) {
      .controls { align-items: stretch; flex-direction: column; gap: var(--uui-size-space-4); }
      .project-select { inline-size: min(100%, 28rem); max-inline-size: 100%; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .breakdown-card, .wide { grid-column: auto; }
    }
    @container (max-width: 48rem) {
      .grid { grid-template-columns: 1fr; }
      .metric-tab { flex: 1 1 50%; min-inline-size: 0; }
    }
    @container (max-width: 40rem) {
      .report-controls, .date-actions { align-items: stretch; flex-direction: column; }
      .report-controls > *, .date-actions > *, .date-control uui-input { box-sizing: border-box; inline-size: 100%; max-inline-size: none; }
      .metric-tabs { flex-direction: column; }
      .metric-tab { box-sizing: border-box; flex: 0 0 auto; inline-size: 100%; }
      .metric-tab + .metric-tab { border-inline-start: 0; border-top: 1px solid var(--uui-color-border); }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; } }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-dashboard": VercelAnalyticsDashboardElement;
  }
}
