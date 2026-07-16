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
import type { UUISelectElement } from "@umbraco-cms/backoffice/external/uui";
import { UmbracoVercelAnalyticsService } from "../api/sdk.gen.js";
import type {
  AnalyticsBreakdown,
  AnalyticsConnectionSummary,
  AnalyticsDimension,
  AnalyticsDocumentRoute,
  AnalyticsEventDetails,
  AnalyticsEventProperty,
  AnalyticsEventRow,
  AnalyticsEventsReport,
  AnalyticsSummary,
} from "../api/types.gen.js";
import { dateRangeForPreset, inclusiveRangeDays, type AnalyticsDateRange, type DatePreset } from "./date-range.js";
import { reportErrorMessage } from "./report-error.js";
import { detectUtmCapability, isUtmDimension, type UtmCapability } from "./utm-capability.js";
import { topBreakdownRows } from "./breakdown-rows.js";
import { countryDisplayName, countrySearchValue, normalizeCountryCode } from "./country-display.js";
import { metricComparison } from "./metric-comparison.js";
import { activeDocumentRoute } from "./document-route.js";
import { topEventRows, visibleEventRows } from "./event-rows.js";
import {
  parseDashboardUrlState,
  serializeFilter,
  writeDashboardUrlState,
  type AnalyticsFilter,
  type AudienceDimension,
  type DashboardMetric,
  type UtmDimension,
} from "./dashboard-url-state.js";
import "./history-chart.element.js";
import "./breakdown-table.element.js";
import "./breakdown-dialog.element.js";
import "./event-table.element.js";
import "./event-dialog.element.js";
import "./event-details-dialog.element.js";
import "./date-range-picker.element.js";
import type { AnalyticsDateRangeChangeDetail } from "./date-range-picker.element.js";

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
type SelectedEvent = {
  eventName: string;
  details?: AnalyticsEventDetails;
  loading: boolean;
  error?: string;
  eventProperty?: string;
  eventValue?: string;
  propertySearch?: {
    propertyName: string;
    search: string;
    property?: AnalyticsEventProperty;
    loading: boolean;
    error?: string;
  };
};

const BREAKDOWNS: ReadonlyArray<{ dimension: AnalyticsDimension; headline: string; wide?: boolean; planLimited?: boolean }> = [
  { dimension: "RequestPath", headline: "Pages", wide: true },
  { dimension: "ReferrerHostname", headline: "Referrers", wide: true },
  { dimension: "Country", headline: "Countries" },
  { dimension: "DeviceType", headline: "Devices" },
  { dimension: "BrowserName", headline: "Browsers" },
  { dimension: "OsName", headline: "Operating systems" },
  { dimension: "UtmSource", headline: "UTM sources", planLimited: true },
  { dimension: "UtmMedium", headline: "UTM media", planLimited: true },
  { dimension: "UtmCampaign", headline: "UTM campaigns", planLimited: true },
];
const UTM_TABS: ReadonlyArray<{ dimension: UtmDimension; label: string; headline: string }> = [
  { dimension: "UtmSource", label: "Sources", headline: "UTM sources" },
  { dimension: "UtmMedium", label: "Media", headline: "UTM media" },
  { dimension: "UtmCampaign", label: "Campaigns", headline: "UTM campaigns" },
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
  @state() private _metric: DashboardMetric = "visitors";
  @state() private _audienceDimension: AudienceDimension = "DeviceType";
  @state() private _utmDimension: UtmDimension = "UtmSource";
  @state() private _filters: AnalyticsFilter[] = [];
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
  #eventPropertyAbort?: AbortController;
  #eventPropertySearchTimer?: number;
  #eventPropertyRequest = 0;
  #lastScopeKey?: string;
  #hasUrlDateState = false;
  #utmCapabilityByConnection = new Map<string, UtmCapability>();

  connectedCallback(): void {
    super.connectedCallback();
    this.#restoreUrlState();
    void this.#initialize();
  }

  override disconnectedCallback(): void {
    this.#expandedAbort?.abort();
    this.#eventAbort?.abort();
    this.#eventPropertyAbort?.abort();
    if (this.#expandedSearchTimer !== undefined) window.clearTimeout(this.#expandedSearchTimer);
    if (this.#eventSearchTimer !== undefined) window.clearTimeout(this.#eventSearchTimer);
    if (this.#eventPropertySearchTimer !== undefined) window.clearTimeout(this.#eventPropertySearchTimer);
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

  #restoreUrlState(): void {
    const state = parseDashboardUrlState(new URLSearchParams(window.location.search));
    this._connection = state.connection;
    this._metric = state.metric;
    this._audienceDimension = state.audience;
    this._utmDimension = state.utm;
    this._filters = state.filters;
    if (state.range) {
      this._range = state.range;
      this._preset = state.preset ?? "custom";
      this.#hasUrlDateState = true;
    } else if (state.preset && state.preset !== "custom") {
      this._preset = state.preset;
      this._range = dateRangeForPreset(state.preset);
      this.#hasUrlDateState = true;
    }
  }

  #syncUrlState(): void {
    const url = writeDashboardUrlState(new URL(window.location.href), {
      connection: this._connection,
      preset: this._preset,
      range: this._range,
      metric: this._metric,
      audience: this._audienceDimension,
      utm: this._utmDimension,
      filters: this._filters,
    });
    window.history.replaceState(window.history.state, "", url);
  }

  #filterQuery(): { filter?: string[] } {
    return this._filters.length ? { filter: this._filters.map(serializeFilter) } : {};
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
      if (!this.#hasUrlDateState) {
        const defaultDays = data.defaultRangeDays;
        if ([7, 30, 90, 365].includes(defaultDays)) {
          this._preset = defaultDays as Exclude<DatePreset, "custom">;
        } else {
          this._preset = "custom";
        }
        this._range = dateRangeForPreset(defaultDays);
      }
      const stored = localStorage.getItem("umbraco-vercel-analytics:connection");
      const requestedConnection = this._connection;
      const requestedConnectionExists = data.connections.some((item) => item.alias === requestedConnection);
      const storedConnectionExists = data.connections.some((item) => item.alias === stored);
      this._connection = requestedConnectionExists
        ? requestedConnection
        : storedConnectionExists
          ? stored ?? undefined
          : data.defaultConnection ?? data.connections[0]?.alias;
    }
    this.#syncUrlState();
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
    this.#eventPropertyAbort?.abort();
    if (this.#eventPropertySearchTimer !== undefined) window.clearTimeout(this.#eventPropertySearchTimer);
    this.#eventPropertyRequest++;
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

    const query = { connection: this._connection, ...this._range, ...this.#scope(), ...this.#filterQuery() };
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

    const connection = this._connections.find((item) => item.alias === this._connection);
    return connection?.baseUrl ?? (connection?.hostnames[0] ? `https://${connection.hostnames[0]}` : undefined);
  }

  #linkHostname(baseUrl: string | undefined): string | undefined {
    if (!baseUrl) return undefined;
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return undefined;
    }
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
          ...this.#filterQuery(),
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
        query: { connection: this._connection, ...this._range, ...this.#scope(), ...this.#filterQuery(), limit: 100, search: search || undefined },
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
    await this.#loadEventDetails(event.detail.eventName);
  }

  async #loadEventDetails(eventName: string, eventProperty?: string, eventValue?: string): Promise<void> {
    if (!this._connection) return;
    const request = ++this.#eventRequest;
    const previousDetails = this._selectedEvent?.eventName === eventName
      ? this._selectedEvent.details
      : undefined;
    this._selectedEvent = { eventName, eventProperty, eventValue, details: previousDetails, loading: true };
    const { data, error, response } = await UmbracoVercelAnalyticsService.eventDetails({
      query: {
        connection: this._connection,
        ...this._range,
        ...this.#scope(),
        ...this.#filterQuery(),
        eventName,
        eventProperty,
        eventValue,
      },
    });
    if (request !== this.#eventRequest || this._selectedEvent?.eventName !== eventName) return;
    this._selectedEvent = error
      ? { eventName, eventProperty, eventValue, details: previousDetails, loading: false, error: reportErrorMessage({ status: response.status }) }
      : { eventName, eventProperty, eventValue, loading: false, details: data };
  }

  #toggleEventPropertyFilter(event: CustomEvent<{ property: string; value: string }>): void {
    if (!this._selectedEvent) return;
    const active = this._selectedEvent.eventProperty === event.detail.property
      && this._selectedEvent.eventValue === event.detail.value;
    void this.#loadEventDetails(
      this._selectedEvent.eventName,
      active ? undefined : event.detail.property,
      active ? undefined : event.detail.value,
    );
  }

  #searchEventProperty(event: CustomEvent<{ propertyName: string; search: string }>): void {
    if (!this._selectedEvent) return;
    this.#eventPropertyAbort?.abort();
    this.#eventPropertyRequest++;
    if (this.#eventPropertySearchTimer !== undefined) window.clearTimeout(this.#eventPropertySearchTimer);
    const search = event.detail.search.trim();
    if (!search) {
      this._selectedEvent = { ...this._selectedEvent, propertySearch: undefined };
      return;
    }

    this._selectedEvent = {
      ...this._selectedEvent,
      propertySearch: { propertyName: event.detail.propertyName, search, loading: true },
    };
    this.#eventPropertySearchTimer = window.setTimeout(() => {
      void this.#loadEventPropertyValues(event.detail.propertyName, search);
    }, 300);
  }

  async #loadEventPropertyValues(propertyName: string, search: string): Promise<void> {
    if (!this._connection || !this._selectedEvent) return;
    this.#eventPropertyAbort?.abort();
    const abort = new AbortController();
    this.#eventPropertyAbort = abort;
    const request = ++this.#eventPropertyRequest;
    const eventName = this._selectedEvent.eventName;
    const eventProperty = this._selectedEvent.eventProperty;
    const eventValue = this._selectedEvent.eventValue;
    try {
      const { data, error, response } = await UmbracoVercelAnalyticsService.eventPropertyValues({
        query: {
          connection: this._connection,
          ...this._range,
          ...this.#scope(),
          ...this.#filterQuery(),
          eventName,
          propertyName,
          limit: 100,
          search,
          eventProperty,
          eventValue,
        },
        signal: abort.signal,
      });
      if (request !== this.#eventPropertyRequest || this._selectedEvent?.eventName !== eventName) return;
      this._selectedEvent = {
        ...this._selectedEvent,
        propertySearch: error
          ? { propertyName, search, loading: false, error: reportErrorMessage({ status: response.status }) }
          : { propertyName, search, loading: false, property: data },
      };
    } catch (error) {
      if (abort.signal.aborted || request !== this.#eventPropertyRequest || this._selectedEvent?.eventName !== eventName) return;
      this._selectedEvent = {
        ...this._selectedEvent,
        propertySearch: { propertyName, search, loading: false, error: reportErrorMessage(error) },
      };
    }
  }

  #closeEventDetails(): void {
    this.#eventPropertyAbort?.abort();
    if (this.#eventPropertySearchTimer !== undefined) window.clearTimeout(this.#eventPropertySearchTimer);
    this.#eventPropertyRequest++;
    this.#eventRequest++;
    this._selectedEvent = undefined;
  }

  #selectOptions(items: Array<{ value: string; name: string }>, selected?: string) {
    return items.map((item) => ({ ...item, selected: item.value === selected }));
  }

  #onConnectionChange(event: Event): void {
    this._connection = (event.target as UUISelectElement).value as string;
    localStorage.setItem("umbraco-vercel-analytics:connection", this._connection);
    this.#syncUrlState();
    void this.#loadReports();
  }

  #onDateRangeChange(event: CustomEvent<AnalyticsDateRangeChangeDetail>): void {
    this._preset = event.detail.preset;
    this._range = event.detail.range;
    this.#syncUrlState();
    void this.#loadReports();
  }

  #setMetric(metric: DashboardMetric): void {
    this._metric = metric;
    this.#syncUrlState();
  }

  #setAudienceDimension(dimension: AudienceDimension): void {
    this._audienceDimension = dimension;
    this.#syncUrlState();
  }

  #setUtmDimension(dimension: UtmDimension): void {
    this._utmDimension = dimension;
    this.#syncUrlState();
  }

  #toggleFilter(event: CustomEvent<{ dimension?: AnalyticsDimension; value: string }>): void {
    const { dimension, value } = event.detail;
    if (!dimension || !value) return;
    const active = this._filters.some((filter) => filter.dimension === dimension && filter.value === value);
    this._filters = active
      ? this._filters.filter((filter) => filter.dimension !== dimension)
      : [...this._filters.filter((filter) => filter.dimension !== dimension), { dimension, value }];
    this.#syncUrlState();
    void this.#loadReports();
  }

  #removeFilter(dimension: AnalyticsDimension): void {
    this._filters = this._filters.filter((filter) => filter.dimension !== dimension);
    this.#syncUrlState();
    void this.#loadReports();
  }

  #clearFilters(): void {
    this._filters = [];
    this.#syncUrlState();
    void this.#loadReports();
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
    const siteUrl = this.#linkBaseUrl();
    const hostname = this._route?.hostname ?? connection?.hostnames[0] ?? this.#linkHostname(siteUrl);
    const siteLabel = hostname ?? connection?.displayName;
    return html`
      <header>
        <div class="site-context">
          ${hostname && siteUrl ? html`
            <a class="site-link" href=${siteUrl} target="_blank" rel="noopener noreferrer">
              <uui-icon name="icon-globe" aria-hidden="true"></uui-icon>
              <span class="site-link-label">${hostname}</span>
              <uui-icon class="external-indicator" name="icon-out" aria-hidden="true"></uui-icon>
              <span class="visually-hidden">Open site in a new tab</span>
            </a>
          ` : siteLabel ? html`
            <span class="site-name">
              <uui-icon name="icon-globe" aria-hidden="true"></uui-icon>
              <span>${siteLabel}</span>
            </span>
          ` : ""}
        </div>
        <div class="controls">
          ${!this.documentId && this._connections.length > 1 ? html`
            <uui-select
              class="project-select"
              label="Vercel project"
              .options=${this.#selectOptions(this._connections.map((item) => ({ value: item.alias, name: item.displayName })), this._connection)}
              @change=${this.#onConnectionChange}></uui-select>
          ` : ""}
          <vercel-analytics-date-range-picker
            .preset=${this._preset}
            .range=${this._range}
            @analytics-date-range-change=${this.#onDateRangeChange}></vercel-analytics-date-range-picker>
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
            @click=${() => this.#setMetric("visitors")}
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
            @click=${() => this.#setMetric("pageViews")}
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

  #filterLabel(filter: AnalyticsFilter): string {
    if (filter.dimension === "Country") {
      const code = normalizeCountryCode(filter.value);
      if (code) return countryDisplayName(code, navigator.languages);
    }
    return filter.value;
  }

  #filterDimensionLabel(dimension: AnalyticsDimension): string {
    const labels: Record<AnalyticsDimension, string> = {
      RequestPath: "Page",
      Route: "Route",
      ReferrerHostname: "Referrer",
      Country: "Country",
      DeviceType: "Device",
      BrowserName: "Browser",
      OsName: "Operating system",
      UtmSource: "UTM source",
      UtmMedium: "UTM medium",
      UtmCampaign: "UTM campaign",
      EventName: "Event",
    };
    return labels[dimension];
  }

  #renderFilters() {
    if (!this._filters.length) return "";
    return html`
      <section class="active-filters" aria-label="Active analytics filters">
        <div class="filter-heading">
          <uui-icon name="icon-filter" aria-hidden="true"></uui-icon>
          <strong>Filters</strong>
        </div>
        <div class="filter-list" role="group" aria-label="Applied filters">
          ${this._filters.map((filter) => {
            const value = this.#filterLabel(filter);
            const dimension = this.#filterDimensionLabel(filter.dimension);
            return html`
              <button type="button" class="filter-badge" aria-label=${`Remove ${dimension} filter ${value}`} @click=${() => this.#removeFilter(filter.dimension)}>
                <span class="filter-value">${value}</span>
                <span class="filter-remove" aria-hidden="true">×</span>
              </button>
            `;
          })}
        </div>
        <uui-button class="clear-filters" look="secondary" compact label="Clear all analytics filters" @click=${this.#clearFilters}>Clear all</uui-button>
      </section>
    `;
  }

  #renderBreakdown(
    dimension: AnalyticsDimension,
    headline: string,
    wide = false,
    planLimited = false,
    tabs?: "audience" | "utm",
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
            .filters=${this._filters}
            .baseUrl=${this.#linkBaseUrl()}
            .linkValues=${linkValues}
            .unavailable=${state?.error}>
            ${tabs === "audience" ? html`
              <div slot="heading" class="breakdown-tabs" role="tablist" aria-label="Audience technology">
                <button
                  type="button"
                  role="tab"
                  aria-selected=${this._audienceDimension === "DeviceType"}
                  tabindex=${this._audienceDimension === "DeviceType" ? 0 : -1}
                  @click=${() => this.#setAudienceDimension("DeviceType")}
                  @keydown=${this.#onMetricKeydown}>Devices</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected=${this._audienceDimension === "BrowserName"}
                  tabindex=${this._audienceDimension === "BrowserName" ? 0 : -1}
                  @click=${() => this.#setAudienceDimension("BrowserName")}
                  @keydown=${this.#onMetricKeydown}>Browsers</button>
              </div>
            ` : tabs === "utm" ? html`
              <div slot="heading" class="breakdown-tabs" role="tablist" aria-label="UTM parameter">
                ${UTM_TABS.map(({ dimension: tabDimension, label }) => html`
                  <button
                    type="button"
                    role="tab"
                    aria-selected=${this._utmDimension === tabDimension}
                    tabindex=${this._utmDimension === tabDimension ? 0 : -1}
                    @click=${() => this.#setUtmDimension(tabDimension)}
                    @keydown=${this.#onMetricKeydown}>${label}</button>
                `)}
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
        "audience",
      );
    }
    return this.#renderBreakdown(item.dimension, item.headline, item.wide, item.planLimited);
  }

  #renderUtmBreakdown() {
    if (this._utmCapability === "unavailable") return "";
    const selected = UTM_TABS.find(({ dimension }) => dimension === this._utmDimension) ?? UTM_TABS[0];
    return this.#renderBreakdown(selected.dimension, selected.headline, true, true, "utm");
  }

  #renderEvents() {
    const rows = topEventRows(this._events.data?.rows ?? [], 10);
    if (!this._events.loading && rows.length === 0) return "";
    return html`
      <uui-box class="breakdown-card wide">
        <div class="breakdown-card-layout">
          <vercel-analytics-event-table .rows=${rows} .filters=${this._filters} .loading=${this._events.loading} @select-event=${this.#selectEvent}></vercel-analytics-event-table>
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
      <main @toggle-filter=${this.#toggleFilter}>
        ${this.#renderHeader()}
        ${this.#renderFilters()}
        ${this.#renderSummary()}
        <section class="grid" aria-label="Traffic breakdowns">
          ${this.#availableBreakdowns().filter(({ dimension }) => !isUtmDimension(dimension)).map((item) => this.#renderBreakdownItem(item))}
          ${this.#renderEvents()}
          ${this.#renderUtmBreakdown()}
        </section>
        ${this._expanded ? html`
          <vercel-analytics-breakdown-dialog
            .headline=${this._expanded.headline}
            .dimension=${this._expanded.dimension}
            .rows=${this._expanded.rows}
            .filters=${this._filters}
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
            .filters=${this._filters}
            .loading=${this._expandedEvents.loading}
            .unavailable=${this._expandedEvents.error}
            @search-events=${this.#searchEvents}
            @select-event=${this.#selectEvent}
            @close-events=${this.#closeEvents}></vercel-analytics-event-dialog>
        ` : ""}
        ${this._selectedEvent ? html`
          <vercel-analytics-event-details-dialog
            .eventName=${this._selectedEvent.eventName}
            .details=${this._selectedEvent.details}
            .loading=${this._selectedEvent.loading}
            .unavailable=${this._selectedEvent.error}
            .filterProperty=${this._selectedEvent.eventProperty}
            .filterValue=${this._selectedEvent.eventValue}
            .searchedProperty=${this._selectedEvent.propertySearch?.property}
            .searchedTerm=${this._selectedEvent.propertySearch?.search}
            .searchLoading=${this._selectedEvent.propertySearch?.loading ?? false}
            .searchUnavailable=${this._selectedEvent.propertySearch?.error}
            @search-event-property=${this.#searchEventProperty}
            @toggle-event-property-filter=${this.#toggleEventPropertyFilter}
            @close-event-details=${this.#closeEventDetails}></vercel-analytics-event-details-dialog>
        ` : ""}
      </main>
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { display: block; }
    main { container-type: inline-size; padding: var(--uui-size-layout-1); max-width: 110rem; margin-inline: auto; }
    header { align-items: center; display: flex; flex-wrap: wrap; gap: var(--uui-size-space-4); justify-content: space-between; margin-bottom: var(--uui-size-space-2); min-block-size: 2.5rem; }
    .hint { color: var(--uui-color-text-alt); }
    .site-context { align-items: center; display: flex; min-block-size: 2.5rem; min-inline-size: 0; }
    .site-link, .site-name { align-items: center; color: var(--uui-color-text); display: inline-flex; font-weight: 700; gap: var(--uui-size-space-2); min-inline-size: 0; text-decoration: none; }
    .site-link:hover .site-link-label { text-decoration: underline; text-underline-offset: 0.18em; }
    .site-link:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 3px; }
    .site-context uui-icon { color: var(--uui-color-text-alt); flex: 0 0 auto; }
    .external-indicator { color: var(--uui-color-text-alt); font-size: 0.875em; }
    .controls { align-items: center; display: flex; flex-wrap: wrap; gap: var(--uui-size-space-3); justify-content: flex-end; margin-inline-start: auto; min-inline-size: 0; }
    .project-select { min-inline-size: 10rem; }
    .metric-tabs { border-bottom: 1px solid var(--uui-color-border); display: flex; flex-wrap: nowrap; }
    .metric-tab { --metric-font-size: clamp(2rem, 3cqi, 3rem); appearance: none; background: transparent; border: 0; border-bottom: 3px solid transparent; color: var(--uui-color-text); cursor: pointer; flex: 0 0 auto; font: inherit; inline-size: max-content; min-inline-size: 18rem; padding: var(--uui-size-space-5); text-align: left; }
    .metric-tab + .metric-tab { border-inline-start: 1px solid var(--uui-color-border); }
    .metric-tab[aria-selected="true"] { border-bottom-color: var(--uui-color-selected); }
    .metric-tab:hover { background: color-mix(in srgb, var(--uui-color-interactive) 7%, var(--uui-color-surface)); }
    .metric-tab:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .metric-value { align-items: center; display: flex; flex-wrap: nowrap; gap: var(--uui-size-space-4); margin-top: var(--uui-size-space-3); }
    .metric-tab strong { font-size: var(--metric-font-size); line-height: 1.1; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .comparison { border-radius: var(--uui-border-radius); flex: 0 0 auto; font-weight: 700; padding: var(--uui-size-space-2) var(--uui-size-space-3); white-space: nowrap; }
    .comparison.increase { background: color-mix(in srgb, var(--uui-color-positive-standalone) 14%, var(--uui-color-surface)); color: var(--uui-color-positive-standalone); }
    .comparison.decrease { background: color-mix(in srgb, var(--uui-color-danger-standalone) 14%, var(--uui-color-surface)); color: var(--uui-color-danger-standalone); }
    .comparison.unchanged { background: var(--uui-color-surface-alt); color: var(--uui-color-text-alt); }
    .metric-skeleton { background: var(--uui-color-surface-alt); block-size: 1.1em; border-radius: var(--uui-border-radius); display: block; font-size: var(--metric-font-size); inline-size: 58%; margin-top: var(--uui-size-space-3); max-inline-size: 14rem; }
    .eyebrow { color: var(--uui-color-text-alt); font-weight: 700; }
    .history { --uui-box-default-padding: 0; margin-bottom: var(--uui-size-layout-1); overflow: hidden; }
    .history-panel { padding: var(--uui-size-space-3); }
    .chart-skeleton { block-size: 18rem; display: grid; }
    .chart-skeleton span { border-top: 1px solid var(--uui-color-border); }
    .summary-error { --uui-box-default-padding: 0; --uui-box-border-width: 1px; --uui-box-border-color: color-mix(in srgb, var(--uui-color-warning-standalone) 35%, var(--uui-color-border)); --uui-box-box-shadow: none; margin-bottom: var(--uui-size-layout-1); overflow: hidden; }
    .summary-error-content { align-items: center; background: color-mix(in srgb, var(--uui-color-warning) 8%, var(--uui-color-surface)); border-inline-start: 3px solid var(--uui-color-warning-standalone); display: flex; flex-wrap: wrap; gap: var(--uui-size-space-5); padding: var(--uui-size-space-5); }
    .summary-error-content uui-icon { color: var(--uui-color-warning-standalone); font-size: 1.5rem; }
    .summary-error-copy { flex: 1 1 22rem; }
    .summary-error-copy p { color: var(--uui-color-text-alt); margin: var(--uui-size-space-1) 0 0; }
    .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--uui-size-layout-1); }
    .breakdown-card { --uui-box-default-padding: 0; grid-column: span 2; overflow: hidden; position: relative; }
    .breakdown-card-layout { box-sizing: border-box; min-block-size: 100%; padding-bottom: 3.25rem; }
    .breakdown-footer { align-items: center; background: color-mix(in srgb, var(--uui-color-surface-alt) 18%, var(--uui-color-surface)); border-top: 1px solid var(--uui-color-border); bottom: 0; box-sizing: border-box; display: flex; justify-content: flex-end; left: 0; min-block-size: 3.25rem; padding: var(--uui-size-space-1) var(--uui-size-space-4); position: absolute; right: 0; }
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
    .active-filters { align-items: center; background: color-mix(in srgb, var(--uui-color-interactive) 3%, var(--uui-color-surface)); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); display: flex; gap: var(--uui-size-space-3); margin-bottom: var(--uui-size-space-5); min-inline-size: 0; padding: var(--uui-size-space-2); }
    .filter-heading { align-items: center; color: var(--uui-color-text-alt); display: flex; flex: 0 0 auto; gap: var(--uui-size-space-2); padding-inline: var(--uui-size-space-2); }
    .filter-heading uui-icon { color: var(--uui-color-interactive); }
    .filter-list { align-items: center; display: flex; flex: 1 1 auto; flex-wrap: wrap; gap: var(--uui-size-space-2); min-inline-size: 0; }
    .filter-badge { align-items: center; appearance: none; background: var(--uui-color-surface); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); color: var(--uui-color-text); cursor: pointer; display: inline-flex; font: inherit; gap: var(--uui-size-space-2); max-inline-size: min(32rem, 100%); min-block-size: 2rem; min-inline-size: 0; padding: var(--uui-size-space-1) var(--uui-size-space-2); }
    .filter-badge:hover { background: color-mix(in srgb, var(--uui-color-interactive) 6%, var(--uui-color-surface)); border-color: var(--uui-color-interactive); }
    .filter-badge:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    .filter-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .filter-remove { color: var(--uui-color-text-alt); flex: 0 0 auto; font-size: 1.1em; line-height: 1; }
    .clear-filters { flex: 0 0 auto; }
    @container (max-width: 62rem) {
      .project-select { inline-size: min(100%, 28rem); max-inline-size: 100%; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .breakdown-card, .wide { grid-column: auto; }
    }
    @container (max-width: 48rem) {
      .grid { grid-template-columns: 1fr; }
      .metric-tab { --metric-font-size: clamp(1.5rem, 4cqi, 2rem); flex: 1 1 50%; min-inline-size: 0; padding: var(--uui-size-space-4); }
      .metric-value { gap: var(--uui-size-space-2); }
      .comparison { font-size: 0.875rem; padding: var(--uui-size-space-1) var(--uui-size-space-2); }
    }
    @container (max-width: 40rem) {
      .metric-tab { --metric-font-size: clamp(1.25rem, 5cqi, 1.75rem); box-sizing: border-box; padding: var(--uui-size-space-3); }
      .eyebrow { font-size: 0.875rem; }
      .comparison { font-size: 0.75rem; }
    }
    @container (max-width: 32rem) {
      header { align-items: stretch; }
      .site-context { flex: 1 1 100%; }
      .controls { align-items: stretch; inline-size: 100%; margin-inline-start: 0; }
      .project-select, vercel-analytics-date-range-picker { box-sizing: border-box; flex: 1 1 100%; inline-size: 100%; max-inline-size: none; }
      .active-filters { align-items: stretch; flex-wrap: wrap; }
      .filter-heading { flex: 1 1 auto; }
      .filter-list { flex-basis: 100%; order: 3; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; } }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-dashboard": VercelAnalyticsDashboardElement;
  }
}
