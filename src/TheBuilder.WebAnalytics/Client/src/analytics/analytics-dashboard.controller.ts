import type {
  AnalyticsBreakdown,
  AnalyticsConnectionSummary,
  AnalyticsDimension,
  AnalyticsDocumentRoute,
  AnalyticsEventDetails,
  AnalyticsEventProperty,
  AnalyticsEventRow,
  AnalyticsEventsReport,
  AnalyticsFlagsReport,
  AnalyticsSummary,
} from "../api/types.gen.js";
import { dashboardApi, type DashboardApi } from "./dashboard-api.js";
import { activeDocumentRoute } from "./document-route.js";
import { countrySearchValue } from "./country-display.js";
import { dashboardReportPlan, type AcquisitionView, type DashboardCard, type DashboardReportPlan } from "./dashboard-cards.js";
import { dateRangeForPreset, type AnalyticsDateRange, type DatePreset } from "./date-range.js";
import {
  parseDashboardUrlState,
  serializeFilter,
  writeDashboardUrlState,
  type AnalyticsFilter,
  type AudienceDimension,
  type DashboardMetric,
  type UtmDimension,
} from "./dashboard-url-state.js";
import { loadDashboardBreakdown, loadDashboardReports, type DashboardReportQuery, type DashboardReportUpdate } from "./dashboard-report-loader.js";
import { visibleEventRows } from "./event-rows.js";
import { reportErrorMessage } from "./report-error.js";
import { DebouncedRequest, RequestCoordinator } from "./request-coordinator.js";
import { detectUtmCapability, type UtmCapability } from "./utm-capability.js";
import { errorState, idleState, loadingState, successState, type AsyncState } from "./async-state.js";

type ReportScope = { documentId?: string; culture?: string; path?: string };
export type ExpandedBreakdown = {
  dimension: AnalyticsDimension;
  headline: string;
  report: AsyncState<AnalyticsBreakdown["rows"]>;
};
export type SelectedEvent = {
  eventName: string;
  details: AsyncState<AnalyticsEventDetails>;
  eventProperty?: string;
  eventValue?: string;
  propertyName?: string;
  propertySearch?: string;
  property: AsyncState<AnalyticsEventProperty>;
};
export type DashboardState = {
  connections: AnalyticsConnectionSummary[];
  connection?: string;
  route?: AnalyticsDocumentRoute;
  range: AnalyticsDateRange;
  preset: DatePreset;
  summary: AsyncState<AnalyticsSummary>;
  breakdowns: Partial<Record<AnalyticsDimension, AsyncState<AnalyticsBreakdown>>>;
  events: AsyncState<AnalyticsEventsReport>;
  flags: AsyncState<AnalyticsFlagsReport>;
  selectedFlag?: AsyncState<AnalyticsFlagsReport>;
  metric: DashboardMetric;
  audienceDimension: AudienceDimension;
  acquisitionView: AcquisitionView;
  utmDimension: UtmDimension;
  filters: AnalyticsFilter[];
  configurationError?: string;
  setupRequired?: boolean;
  utmCapability: UtmCapability;
  expandedBreakdown?: ExpandedBreakdown;
  expandedEvents?: AsyncState<AnalyticsEventRow[]>;
  selectedEvent?: SelectedEvent;
};

export type DashboardEnvironment = {
  currentUrl: () => URL;
  replaceUrl: (url: URL) => void;
  getStoredConnection: () => string | null;
  setStoredConnection: (connection: string) => void;
  languages: ReadonlyArray<string>;
};

const defaultEnvironment = (): DashboardEnvironment => ({
  currentUrl: () => new URL(window.location.href),
  replaceUrl: (url) => window.history.replaceState(window.history.state, "", url),
  getStoredConnection: () => localStorage.getItem("thebuilder-web-analytics:connection"),
  setStoredConnection: (connection) => localStorage.setItem("thebuilder-web-analytics:connection", connection),
  languages: navigator.languages,
});

export class AnalyticsDashboardController {
  state: DashboardState = {
    connections: [],
    range: dateRangeForPreset(30),
    preset: 30,
    summary: loadingState(),
    breakdowns: {},
    events: loadingState(),
    flags: loadingState(),
    metric: "visitors",
    audienceDimension: "DeviceType",
    acquisitionView: "referrers",
    utmDimension: "UtmSource",
    filters: [],
    utmCapability: "unknown",
  };

  readonly #notify: () => void;
  readonly #api: DashboardApi;
  readonly #environment: DashboardEnvironment;
  readonly #initializationRequest = new RequestCoordinator();
  readonly #reportRequest = new RequestCoordinator();
  readonly #utmRequest = new RequestCoordinator();
  readonly #expandedRequest = new DebouncedRequest();
  readonly #eventSearchRequest = new DebouncedRequest();
  readonly #eventDetailsRequest = new RequestCoordinator();
  readonly #flagRequest = new RequestCoordinator();
  readonly #eventPropertyRequest = new DebouncedRequest();
  readonly #utmCapabilityByConnection = new Map<string, UtmCapability>();
  #documentId?: string;
  #culture?: string;
  #scopeKey?: string;
  #urlRestored = false;
  #hasUrlDateState = false;

  constructor(notify: () => void, api: DashboardApi = dashboardApi, environment = defaultEnvironment()) {
    this.#notify = notify;
    this.#api = api;
    this.#environment = environment;
  }

  connect(documentId?: string, culture?: string): void {
    if (!this.#urlRestored) {
      this.#restoreUrlState();
      this.#urlRestored = true;
    }
    this.setScope(documentId, culture);
  }

  setScope(documentId?: string, culture?: string): void {
    const key = documentId ? `${documentId}:${culture ?? ""}` : "global";
    if (key === this.#scopeKey) return;
    this.#scopeKey = key;
    this.#documentId = documentId;
    this.#culture = culture;
    this.#initializationRequest.cancel();
    this.#reportRequest.cancel();
    this.#utmRequest.cancel();
    this.#expandedRequest.cancel();
    this.#eventSearchRequest.cancel();
    this.#eventDetailsRequest.cancel();
    this.#flagRequest.cancel();
    this.#eventPropertyRequest.cancel();
    this.#set({
      route: undefined,
      configurationError: undefined,
      summary: loadingState(),
      breakdowns: {},
      events: loadingState(),
      flags: loadingState(),
      selectedFlag: undefined,
      acquisitionView: "referrers",
      utmCapability: "unknown",
      expandedBreakdown: undefined,
      expandedEvents: undefined,
      selectedEvent: undefined,
    });
    void this.#initialize();
  }

  disconnect(): void {
    this.#initializationRequest.cancel();
    this.#reportRequest.cancel();
    this.#utmRequest.cancel();
    this.#expandedRequest.cancel();
    this.#eventSearchRequest.cancel();
    this.#eventDetailsRequest.cancel();
    this.#flagRequest.cancel();
    this.#eventPropertyRequest.cancel();
  }

  cards(): ReadonlyArray<DashboardCard> {
    return this.#dashboardReportPlan().cards;
  }

  linkBaseUrl(): string | undefined {
    if (this.state.route?.url) {
      try { return new URL(this.state.route.url).origin; }
      catch { return `https://${this.state.route.hostname}`; }
    }
    const connection = this.state.connections.find(({ key }) => key === this.state.connection);
    return connection?.baseUrl ?? undefined;
  }

  async loadReports(): Promise<void> {
    const connection = this.state.connection;
    if (!connection) return;
    this.#closeDialogs();
    this.#utmRequest.cancel();
    const utmCapability = this.#utmCapabilityByConnection.get(connection) ?? "unknown";
    const { dimensions } = this.#dashboardReportPlan(utmCapability);
    this.#set({
      utmCapability,
      summary: loadingState(this.state.summary),
      events: loadingState(this.state.events),
      flags: loadingState(this.state.flags),
      breakdowns: Object.fromEntries(dimensions.map((dimension) => [dimension, loadingState(this.state.breakdowns[dimension])])),
    });
    const visitQuery = this.#reportQuery(connection, this.#visitFilterQuery());
    const eventQuery = this.#reportQuery(connection, this.#eventListFilterQuery());
    const result = await this.#reportRequest.run((signal) => loadDashboardReports(
      visitQuery,
      eventQuery,
      dimensions,
      signal,
      (update) => this.#applyReportUpdate(update),
      this.#api,
    ));
    if (result.status !== "success") {
      if (result.status === "error") this.#failLoadingReports(reportErrorMessage(result.error), dimensions);
      return;
    }
    const capability = detectUtmCapability(
      result.value.baselineSucceeded,
      result.value.utmSucceeded,
      result.value.utmStatuses,
    );
    if (capability !== "unknown") {
      this.#utmCapabilityByConnection.set(connection, capability);
      this.#set({ utmCapability: capability });
    }
  }

  setConnection(connection: string): void {
    this.#utmRequest.cancel();
    this.#environment.setStoredConnection(connection);
    this.#set({ connection, acquisitionView: "referrers" });
    this.#syncUrlState();
    void this.loadReports();
  }

  setDateRange(preset: DatePreset, range: AnalyticsDateRange): void {
    this.#set({ preset, range });
    this.#syncUrlState();
    void this.loadReports();
  }

  setMetric(metric: DashboardMetric): void { this.#set({ metric }); this.#syncUrlState(); }
  setAudienceDimension(audienceDimension: AudienceDimension): void { this.#set({ audienceDimension }); this.#syncUrlState(); }
  setAcquisitionView(acquisitionView: AcquisitionView): void {
    if (acquisitionView === "utm" && this.state.utmCapability !== "available") return;
    if (acquisitionView === this.state.acquisitionView) return;
    if (acquisitionView === "referrers") this.#utmRequest.cancel();
    this.#set({ acquisitionView });
    if (acquisitionView === "utm") this.#ensureUtmBreakdown(this.state.utmDimension);
  }

  setUtmDimension(utmDimension: UtmDimension): void {
    const changed = utmDimension !== this.state.utmDimension;
    if (changed) this.#utmRequest.cancel();
    this.#set({ utmDimension });
    this.#syncUrlState();
    if (changed && this.state.acquisitionView === "utm") this.#ensureUtmBreakdown(utmDimension);
  }

  toggleFilter(dimension: AnalyticsDimension | undefined, value: string): void {
    if (!dimension || !value) return;
    const active = this.state.filters.some((filter) => filter.dimension === dimension && filter.value === value);
    const filters = active
      ? this.state.filters.filter((filter) => filter.dimension !== dimension)
      : [...this.state.filters.filter((filter) => filter.dimension !== dimension), { dimension, value }];
    this.#set({ filters });
    this.#syncUrlState();
    void this.loadReports();
  }

  removeFilter(dimension: AnalyticsDimension): void {
    this.#set({ filters: this.state.filters.filter((filter) => filter.dimension !== dimension) });
    this.#syncUrlState();
    void this.loadReports();
  }

  clearFilters(): void { this.#set({ filters: [] }); this.#syncUrlState(); void this.loadReports(); }

  async openBreakdown(dimension: AnalyticsDimension, headline: string, search = "", debounce = false): Promise<void> {
    const connection = this.state.connection;
    if (!connection) return;
    const previous = this.state.expandedBreakdown?.dimension === dimension ? this.state.expandedBreakdown.report : undefined;
    this.#set({ expandedBreakdown: { dimension, headline, report: loadingState(previous) } });
    const run = (signal: AbortSignal) => this.#api.breakdown({
      path: { dimension },
      query: { ...this.#reportQuery(connection, this.#visitFilterQuery()), limit: 100, search: search || undefined },
      signal,
    });
    const result = await (debounce ? this.#expandedRequest.schedule(run) : this.#expandedRequest.run(run));
    if (result.status === "cancelled" || result.status === "stale" || this.state.expandedBreakdown?.dimension !== dimension) return;
    if (result.status === "error") {
      this.#set({ expandedBreakdown: { dimension, headline, report: errorState(reportErrorMessage(result.error), previous) } });
      return;
    }
    const { data, error, response } = result.value;
    this.#set({ expandedBreakdown: { dimension, headline, report: error
      ? errorState(apiErrorMessage(error, response.status), previous)
      : successState(data?.rows ?? []) } });
  }

  searchBreakdown(search: string): void {
    const expanded = this.state.expandedBreakdown;
    if (!expanded) return;
    const value = expanded.dimension === "Country" ? countrySearchValue(search, this.#environment.languages) : search;
    void this.openBreakdown(expanded.dimension, expanded.headline, value, true);
  }

  closeBreakdown(): void { this.#expandedRequest.cancel(); this.#set({ expandedBreakdown: undefined }); }

  async openEvents(search = "", debounce = false): Promise<void> {
    const connection = this.state.connection;
    if (!connection) return;
    const previous = this.state.expandedEvents;
    this.#set({ expandedEvents: loadingState(previous) });
    const run = (signal: AbortSignal) => this.#api.events({
      query: { ...this.#reportQuery(connection, this.#eventListFilterQuery()), limit: 100, search: search || undefined }, signal,
    });
    const result = await (debounce ? this.#eventSearchRequest.schedule(run) : this.#eventSearchRequest.run(run));
    if (result.status === "cancelled" || result.status === "stale" || !this.state.expandedEvents) return;
    if (result.status === "error") { this.#set({ expandedEvents: errorState(reportErrorMessage(result.error), previous) }); return; }
    const { data, error, response } = result.value;
    this.#set({ expandedEvents: error
      ? errorState(apiErrorMessage(error, response.status), previous)
      : successState(visibleEventRows(data?.rows ?? [])) });
  }

  closeEvents(): void { this.#eventSearchRequest.cancel(); this.#set({ expandedEvents: undefined }); }

  async selectFlag(flagKey: string): Promise<void> {
    const connection = this.state.connection;
    if (!connection) return;
    const previous = this.state.selectedFlag;
    this.#set({ selectedFlag: loadingState(previous) });
    const result = await this.#flagRequest.run((signal) => this.#api.flags({
      query: { ...this.#reportQuery(connection, this.#visitFilterQuery()), flagKey, limit: 100 }, signal,
    }));
    if (result.status === "cancelled" || result.status === "stale") return;
    if (result.status === "error") { this.#set({ selectedFlag: errorState(reportErrorMessage(result.error), previous) }); return; }
    const { data, error, response } = result.value;
    this.#set({ selectedFlag: error || !data
      ? errorState(apiErrorMessage(error, response.status), previous)
      : successState(data) });
  }

  clearSelectedFlag(): void { this.#flagRequest.cancel(); this.#set({ selectedFlag: undefined }); }

  async selectEvent(eventName: string): Promise<void> { this.closeEvents(); await this.#loadEventDetails(eventName); }

  toggleEventPropertyFilter(property: string, value: string): void {
    const selected = this.state.selectedEvent;
    if (!selected) return;
    const active = selected.eventProperty === property && selected.eventValue === value;
    void this.#loadEventDetails(selected.eventName, active ? undefined : property, active ? undefined : value);
  }

  searchEventProperty(propertyName: string, search: string): void {
    if (this.state.selectedEvent) void this.#loadEventPropertyValues(propertyName, search.trim(), true);
  }

  closeEventDetails(): void {
    this.#eventPropertyRequest.cancel();
    this.#eventDetailsRequest.cancel();
    this.#set({ selectedEvent: undefined });
  }

  #set(patch: Partial<DashboardState>): void { this.state = { ...this.state, ...patch }; this.#notify(); }

  async #initialize(): Promise<void> {
    this.#set({ configurationError: undefined, setupRequired: false });
    if (this.#documentId) {
      const documentId = this.#documentId;
      const result = await this.#initializationRequest.run((signal) => this.#api.documentRoutes({
        path: { documentId }, query: { culture: this.#culture }, signal,
      }));
      if (result.status === "cancelled" || result.status === "stale") return;
      if (result.status === "error") { this.#set({ configurationError: reportErrorMessage(result.error), summary: idleState() }); return; }
      const { data, error } = result.value;
      const route = !error && data?.length ? activeDocumentRoute(data, this.#culture) : undefined;
      if (!route) {
        this.#set({ configurationError: "This document is unpublished, unmapped, or its active culture is not configured for analytics.", summary: idleState() });
        return;
      }
      this.#set({ route, connection: route.connection });
    } else {
      const result = await this.#initializationRequest.run((signal) => this.#api.connections({ signal }));
      if (result.status === "cancelled" || result.status === "stale") return;
      if (result.status === "error") { this.#set({ configurationError: reportErrorMessage(result.error), summary: idleState() }); return; }
      const { data, error } = result.value;
      if (error || !data?.enabled) {
        this.#set({ configurationError: "Vercel Analytics is disabled or unavailable. Ask an administrator to configure a connection.", summary: idleState() });
        return;
      }
      if (data.connections.length === 0) {
        this.#set({ setupRequired: true, summary: idleState() });
        return;
      }
      let { preset, range } = this.state;
      if (!this.#hasUrlDateState) {
        preset = [1, 7, 30, 90, 365].includes(data.defaultRangeDays) ? data.defaultRangeDays as Exclude<DatePreset, "custom"> : "custom";
        range = dateRangeForPreset(data.defaultRangeDays);
      }
      const stored = this.#environment.getStoredConnection();
      const requested = data.connections.some(({ key }) => key === this.state.connection) ? this.state.connection : undefined;
      const storedValid = data.connections.some(({ key }) => key === stored) ? stored ?? undefined : undefined;
      this.#set({
        connections: data.connections,
        connection: requested ?? storedValid ?? data.connections[0]?.key,
        preset,
        range,
      });
    }
    this.#syncUrlState();
    await this.loadReports();
  }

  #applyReportUpdate(update: DashboardReportUpdate): void {
    if (update.panel === "summary") {
      this.#set({ summary: update.status === "error" ? errorState(update.error, this.state.summary) : successState(update.data) });
    } else if (update.panel === "events") {
      this.#set({ events: update.status === "error" ? errorState(update.error, this.state.events) : successState(update.data) });
    } else if (update.panel === "flags") {
      this.#set({ flags: update.status === "error" ? errorState(update.error, this.state.flags) : successState(update.data) });
    } else {
      const previous = this.state.breakdowns[update.dimension];
      this.#set({ breakdowns: { ...this.state.breakdowns, [update.dimension]: update.status === "error"
        ? errorState(update.error, previous)
        : successState(update.data) } });
    }
  }

  #failLoadingReports(message: string, dimensions: ReadonlyArray<AnalyticsDimension>): void {
    this.#set({
      summary: errorState(message, this.state.summary),
      events: errorState(message, this.state.events),
      flags: errorState(message, this.state.flags),
      breakdowns: Object.fromEntries(dimensions.map((dimension) => [dimension, errorState(message, this.state.breakdowns[dimension])])),
    });
  }

  #dashboardReportPlan(utmCapability = this.state.utmCapability): DashboardReportPlan {
    return dashboardReportPlan(
      Boolean(this.#documentId),
      utmCapability,
      this.state.acquisitionView,
      this.state.utmDimension,
    );
  }

  #ensureUtmBreakdown(dimension: UtmDimension): void {
    const report = this.state.breakdowns[dimension];
    if (report?.status === "success") return;
    void this.#loadUtmBreakdown(dimension);
  }

  async #loadUtmBreakdown(dimension: UtmDimension): Promise<void> {
    const connection = this.state.connection;
    if (!connection || this.state.utmCapability !== "available" || this.state.acquisitionView !== "utm") return;
    const previous = this.state.breakdowns[dimension];
    this.#set({ breakdowns: { ...this.state.breakdowns, [dimension]: loadingState(previous) } });
    const result = await this.#utmRequest.run((signal) => loadDashboardBreakdown(
      this.#reportQuery(connection, this.#visitFilterQuery()),
      dimension,
      signal,
      this.#api,
    ));
    if (result.status === "cancelled" || result.status === "stale"
      || this.state.connection !== connection
      || this.state.acquisitionView !== "utm"
      || this.state.utmDimension !== dimension) return;
    if (result.status === "error") {
      this.#set({ breakdowns: { ...this.state.breakdowns, [dimension]: errorState(reportErrorMessage(result.error), previous) } });
      return;
    }
    this.#applyReportUpdate(result.value.update);
  }

  async #loadEventDetails(eventName: string, eventProperty?: string, eventValue?: string): Promise<void> {
    const connection = this.state.connection;
    if (!connection) return;
    this.#eventPropertyRequest.cancel();
    const previous = this.state.selectedEvent?.eventName === eventName ? this.state.selectedEvent.details : undefined;
    this.#set({ selectedEvent: { eventName, eventProperty, eventValue, details: loadingState(previous), property: idleState() } });
    const result = await this.#eventDetailsRequest.run((signal) => this.#api.eventDetails({
      query: { ...this.#reportQuery(connection, this.#visitFilterQuery()), eventName, eventProperty, eventValue }, signal,
    }));
    if (result.status === "cancelled" || result.status === "stale" || this.state.selectedEvent?.eventName !== eventName) return;
    if (result.status === "error") {
      this.#set({ selectedEvent: { ...this.state.selectedEvent, details: errorState(reportErrorMessage(result.error), previous) } });
      return;
    }
    const { data, error, response } = result.value;
    if (error || !data) {
      this.#set({ selectedEvent: { ...this.state.selectedEvent, details: errorState(apiErrorMessage(error, response.status), previous) } });
      return;
    }
    this.#set({ selectedEvent: { ...this.state.selectedEvent, details: successState(data) } });
    const firstProperty = data.properties[0]?.name;
    if (firstProperty) void this.#loadEventPropertyValues(firstProperty, "");
  }

  async #loadEventPropertyValues(propertyName: string, search: string, debounce = false): Promise<void> {
    const connection = this.state.connection;
    const selected = this.state.selectedEvent;
    if (!connection || !selected) return;
    const previous = selected.property;
    this.#set({ selectedEvent: { ...selected, propertyName, propertySearch: search, property: loadingState(previous) } });
    const run = (signal: AbortSignal) => this.#api.eventPropertyValues({
      query: {
        ...this.#reportQuery(connection, this.#visitFilterQuery()),
        eventName: selected.eventName,
        propertyName,
        limit: 100,
        search,
        eventProperty: selected.eventProperty,
        eventValue: selected.eventValue,
      },
      signal,
    });
    const result = await (debounce ? this.#eventPropertyRequest.schedule(run) : this.#eventPropertyRequest.run(run));
    const current = this.state.selectedEvent;
    if (result.status === "cancelled" || result.status === "stale" || current?.eventName !== selected.eventName || current.propertyName !== propertyName) return;
    if (result.status === "error") {
      this.#set({ selectedEvent: { ...current, property: errorState(reportErrorMessage(result.error), previous) } });
      return;
    }
    const { data, error, response } = result.value;
    this.#set({ selectedEvent: { ...current, property: error || !data
      ? errorState(apiErrorMessage(error, response.status), previous)
      : successState(data) } });
  }

  #reportQuery(connection: string, filter: { filter?: string[] }): DashboardReportQuery {
    const { from, to, interval } = this.state.range;
    return { connection, from, to, interval, ...this.#scope(), ...filter } as DashboardReportQuery;
  }

  #scope(): ReportScope {
    return this.#documentId && this.state.route
      ? { documentId: this.#documentId, culture: this.state.route.culture, path: this.state.route.path }
      : {};
  }

  #serializedFilters(filters: AnalyticsFilter[]): { filter?: string[] } {
    return filters.length ? { filter: filters.map(serializeFilter) } : {};
  }

  #visitFilterQuery(): { filter?: string[] } {
    return this.#serializedFilters(this.state.filters.filter(({ dimension }) => dimension !== "EventName"));
  }

  #eventListFilterQuery(): { filter?: string[] } { return this.#serializedFilters(this.state.filters); }

  #restoreUrlState(): void {
    const parsed = parseDashboardUrlState(this.#environment.currentUrl().searchParams);
    const patch: Partial<DashboardState> = {
      connection: parsed.connection,
      metric: parsed.metric,
      audienceDimension: parsed.audience,
      utmDimension: parsed.utm,
      filters: parsed.filters,
    };
    if (parsed.range) {
      patch.range = parsed.range;
      patch.preset = parsed.preset ?? "custom";
      this.#hasUrlDateState = true;
    } else if (parsed.preset && parsed.preset !== "custom") {
      patch.preset = parsed.preset;
      patch.range = dateRangeForPreset(parsed.preset);
      this.#hasUrlDateState = true;
    }
    this.#set(patch);
  }

  #syncUrlState(): void {
    this.#environment.replaceUrl(writeDashboardUrlState(this.#environment.currentUrl(), {
      connection: this.state.connection,
      preset: this.state.preset,
      range: this.state.range,
      metric: this.state.metric,
      audience: this.state.audienceDimension,
      utm: this.state.utmDimension,
      filters: this.state.filters,
    }));
  }

  #closeDialogs(): void {
    this.#expandedRequest.cancel();
    this.#eventSearchRequest.cancel();
    this.#eventDetailsRequest.cancel();
    this.#flagRequest.cancel();
    this.#eventPropertyRequest.cancel();
    this.#set({ expandedBreakdown: undefined, expandedEvents: undefined, selectedEvent: undefined, selectedFlag: undefined });
  }
}

function apiErrorMessage(error: unknown, status: number): string {
  return reportErrorMessage(typeof error === "object" && error !== null ? { ...error, status } : { status });
}
