import type {
  AnalyticsBreakdown,
  AnalyticsCapabilities,
  AnalyticsConnectionSummary,
  AnalyticsDimension,
  AnalyticsDocumentRoute,
  AnalyticsEventsReport,
  AnalyticsFlagsReport,
  AnalyticsProvider,
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
  type AnalyticsEventFilter,
  type AnalyticsFilter,
  type AnalyticsFlagFilter,
  type AudienceDimension,
  type DashboardMetric,
  type UtmDimension,
} from "./dashboard-url-state.js";
import { loadDashboardBreakdown, loadDashboardBreakdowns, loadDashboardReports, type DashboardReportQuery, type DashboardReportUpdate } from "./dashboard-report-loader.js";
import { AnalyticsFeatureDrilldownController } from "./analytics-feature-drilldown.controller.js";
import { reportErrorMessage } from "./report-error.js";
import { DebouncedRequest, RequestCoordinator, type RequestResult } from "./request-coordinator.js";
import { detectUtmCapability, type UtmCapability } from "./utm-capability.js";
import { errorState, idleState, loadingState, successState, type AsyncState } from "./async-state.js";
import { normalizeDashboardSelection, supportsDimension, unavailableCapabilities } from "./dashboard-capabilities.js";

type ReportScope = { documentId?: string; culture?: string; path?: string; includeChildPaths?: boolean };
type ReportFilterQuery = Pick<DashboardReportQuery, "filter" | "filterFlagKey" | "filterFlagValue" | "filterEventName" | "filterEventProperty" | "filterEventValue">;
export type ExpandedBreakdown = {
  dimension: AnalyticsDimension;
  headline: string;
  search: string;
  report: AsyncState<AnalyticsBreakdown["rows"]>;
  cache: Readonly<Record<string, AnalyticsBreakdown["rows"]>>;
};
export type DashboardState = {
  connections: AnalyticsConnectionSummary[];
  connection?: string;
  provider?: AnalyticsProvider;
  route?: AnalyticsDocumentRoute;
  capabilities?: AnalyticsCapabilities;
  range: AnalyticsDateRange;
  preset: DatePreset;
  summary: AsyncState<AnalyticsSummary>;
  breakdowns: Partial<Record<AnalyticsDimension, AsyncState<AnalyticsBreakdown>>>;
  events: AsyncState<AnalyticsEventsReport>;
  flags: AsyncState<AnalyticsFlagsReport>;
  metric: DashboardMetric;
  audienceDimension: AudienceDimension;
  acquisitionView: AcquisitionView;
  utmDimension: UtmDimension;
  filters: AnalyticsFilter[];
  flagFilter?: AnalyticsFlagFilter;
  eventFilter?: AnalyticsEventFilter;
  includeChildPaths: boolean;
  configurationError?: string;
  setupRequired?: boolean;
  utmCapability: UtmCapability;
  expandedBreakdown?: ExpandedBreakdown;
};

export type DashboardEnvironment = {
  currentUrl: () => URL;
  replaceUrl: (url: URL) => void;
  getStoredConnection: () => string | null;
  setStoredConnection: (connection: string) => void;
  getStoredDocumentConnection: (root: string) => string | null;
  setStoredDocumentConnection: (root: string, connection: string) => void;
  languages: ReadonlyArray<string>;
};

const defaultEnvironment = (): DashboardEnvironment => ({
  currentUrl: () => new URL(window.location.href),
  replaceUrl: (url) => window.history.replaceState(window.history.state, "", url),
  getStoredConnection: () => localStorage.getItem("thebuilder-web-analytics:connection"),
  setStoredConnection: (connection) => localStorage.setItem("thebuilder-web-analytics:connection", connection),
  getStoredDocumentConnection: (root) => localStorage.getItem(`thebuilder-web-analytics:document-connection:${root}`),
  setStoredDocumentConnection: (root, connection) => localStorage.setItem(`thebuilder-web-analytics:document-connection:${root}`, connection),
  languages: navigator.languages,
});

export class AnalyticsDashboardController {
  readonly features: AnalyticsFeatureDrilldownController;
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
    includeChildPaths: false,
    utmCapability: "unknown",
  };

  readonly #notify: () => void;
  readonly #api: DashboardApi;
  readonly #environment: DashboardEnvironment;
  readonly #initializationRequest = new RequestCoordinator();
  readonly #reportRequest = new RequestCoordinator();
  readonly #utmRequest = new RequestCoordinator();
  readonly #expandedRequest = new DebouncedRequest();
  readonly #utmCapabilityByConnection = new Map<string, UtmCapability>();
  #documentId?: string;
  #culture?: string;
  #scopeKey?: string;
  #urlRestored = false;
  #hasUrlDateState = false;
  #documentRoutes: AnalyticsDocumentRoute[] = [];

  constructor(notify: () => void, api: DashboardApi = dashboardApi, environment = defaultEnvironment()) {
    this.#notify = notify;
    this.#api = api;
    this.#environment = environment;
    this.features = new AnalyticsFeatureDrilldownController(notify, api, () => {
      const connection = this.state.connection;
      return {
        capabilities: this.#capabilities(),
        visitQuery: connection ? this.#reportQuery(connection, this.#visitFilterQuery()) : undefined,
        eventListQuery: connection ? this.#reportQuery(connection, this.#eventListFilterQuery()) : undefined,
        eventFilter: this.state.eventFilter,
      };
    }, (eventFilter) => this.#changeReportScope({ eventFilter }));
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
    this.#documentRoutes = [];
    this.#cancelRequests();
    this.#set({
      route: undefined,
      provider: undefined,
      configurationError: undefined,
      summary: loadingState(),
      breakdowns: {},
      events: loadingState(),
      flags: loadingState(),
      acquisitionView: "referrers",
      utmCapability: "unknown",
      expandedBreakdown: undefined,
    });
    this.features.closeAll();
    void this.#initialize();
  }

  disconnect(): void {
    this.#cancelRequests();
    this.features.disconnect();
  }

  #cancelRequests(): void {
    this.#initializationRequest.cancel();
    this.#reportRequest.cancel();
    this.#utmRequest.cancel();
    this.#expandedRequest.cancel();
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
    const selectedConnection = this.state.connections.find(({ key }) => key === connection);
    if (selectedConnection?.isConfigured === false) {
      this.#reportRequest.cancel();
      this.#utmRequest.cancel();
      this.#set({
        summary: idleState(),
        breakdowns: {},
        events: idleState(),
        flags: idleState(),
        utmCapability: "unknown",
      });
      return;
    }
    this.#utmRequest.cancel();
    const capabilities = this.#capabilities();
    const supportsUtm = capabilities.dimensions.includes("UtmSource");
    const utmCapability = supportsUtm ? this.#utmCapabilityByConnection.get(connection) ?? "unknown" : "unavailable";
    const { dimensions } = this.#dashboardReportPlan(utmCapability);
    this.#set({
      utmCapability,
      summary: loadingState(this.state.summary),
      events: capabilities.events ? loadingState(this.state.events) : idleState(),
      flags: capabilities.flags ? loadingState(this.state.flags) : idleState(),
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
      capabilities,
      this.state.metric,
    ));
    if (result.status !== "success") {
      if (result.status === "error") this.#failLoadingReports(reportErrorMessage(result.error), dimensions);
      return;
    }
    const capability = supportsUtm ? detectUtmCapability(
      result.value.baselineSucceeded,
      result.value.utmSucceeded,
      result.value.utmStatuses,
    ) : "unavailable";
    if (capability !== "unknown") {
      this.#utmCapabilityByConnection.set(connection, capability);
      this.#set({ utmCapability: capability });
    }
  }

  setConnection(connection: string): void {
    this.#utmRequest.cancel();
    const documentRoute = this.#documentId
      ? activeDocumentRoute(this.#documentRoutes, this.#culture, connection)
      : undefined;
    if (this.#documentId && !documentRoute) return;
    if (documentRoute) this.#environment.setStoredDocumentConnection(documentRoute.documentRoot, connection);
    else this.#environment.setStoredConnection(connection);
    // A report from one project must never remain visible while another project's
    // request is in flight. Other refreshes retain their previous value, but a
    // connection change crosses the data boundary and starts with empty state.
    const selectedConnection = this.state.connections.find(({ key }) => key === connection);
    const capabilities = selectedConnection?.capabilities ?? unavailableCapabilities;
    const selection = normalizeDashboardSelection(this.state, capabilities);
    this.#changeReportScope({
      connection,
      route: documentRoute ?? this.state.route,
      provider: selectedConnection?.provider,
      capabilities,
      ...selection,
      acquisitionView: "referrers",
      summary: loadingState(),
      breakdowns: {},
      events: loadingState(),
      flags: loadingState(),
    });
  }

  setDateRange(preset: DatePreset, range: AnalyticsDateRange): void {
    this.#changeReportScope({ preset, range });
  }

  setIncludeChildPaths(includeChildPaths: boolean): void {
    if (this.state.includeChildPaths === includeChildPaths) return;
    this.#changeReportScope({ includeChildPaths });
  }

  setMetric(metric: DashboardMetric): void {
    if (this.state.metric === metric) return;
    this.#set({ metric });
    this.#syncUrlState();
    const capabilities = this.#capabilities();
    const nonBreakdownReportPending = this.state.summary.status === "loading"
      || (capabilities.events && this.state.events.status === "loading")
      || (capabilities.flags && this.state.flags.status === "loading");
    void (nonBreakdownReportPending ? this.loadReports() : this.#loadBreakdowns());
  }
  setAudienceDimension(audienceDimension: AudienceDimension): void { this.#set({ audienceDimension }); this.#syncUrlState(); }
  setAcquisitionView(acquisitionView: AcquisitionView): void {
    if (acquisitionView === "utm" && this.state.utmCapability !== "available") return;
    if (acquisitionView === this.state.acquisitionView) return;
    if (acquisitionView === "referrers") this.#utmRequest.cancel();
    this.#set({ acquisitionView });
    if (acquisitionView === "utm") this.#ensureUtmBreakdown(this.state.utmDimension);
  }

  setUtmDimension(utmDimension: UtmDimension): void {
    if (!supportsDimension(this.#capabilities(), utmDimension)) return;
    const changed = utmDimension !== this.state.utmDimension;
    if (changed) this.#utmRequest.cancel();
    this.#set({ utmDimension });
    this.#syncUrlState();
    if (changed && this.state.acquisitionView === "utm") this.#ensureUtmBreakdown(utmDimension);
  }

  toggleFilter(dimension: AnalyticsDimension | undefined, value: string): void {
    if (!dimension || !value || !supportsDimension(this.#capabilities(), dimension)) return;
    if (dimension === "EventName" && !this.#capabilities().globalEventFiltering) return;
    const active = this.state.filters.some((filter) => filter.dimension === dimension && filter.value === value);
    const filters = active
      ? this.state.filters.filter((filter) => filter.dimension !== dimension)
      : [...this.state.filters.filter((filter) => filter.dimension !== dimension), { dimension, value }];
    this.#changeReportScope({ filters });
  }

  toggleFlagFilter(flagKey: string, value: string): void {
    if (!this.#capabilities().flags || !flagKey) return;
    const active = this.state.flagFilter?.flagKey === flagKey && this.state.flagFilter.value === value;
    this.#changeReportScope({ flagFilter: active ? undefined : { flagKey, value } });
  }

  clearEventFilter(): void {
    this.#changeReportScope({ eventFilter: undefined });
  }

  removeFilter(dimension: AnalyticsDimension): void {
    this.#changeReportScope({ filters: this.state.filters.filter((filter) => filter.dimension !== dimension) });
  }

  removeFlagFilter(): void {
    this.#changeReportScope({ flagFilter: undefined });
  }

  clearFilters(): void {
    this.#changeReportScope({ filters: [], flagFilter: undefined, eventFilter: undefined });
  }

  retryReports(): void {
    this.#changeReportScope({});
  }

  async openBreakdown(
    dimension: AnalyticsDimension,
    headline: string,
    options: { search?: string; debounce?: boolean } = {},
  ): Promise<void> {
    if (!supportsDimension(this.#capabilities(), dimension)) return;
    const connection = this.state.connection;
    if (!connection) return;
    const search = options.search ?? "";
    const query = { ...this.#reportQuery(connection, this.#visitFilterQuery()), limit: 100, search: search || undefined };
    const cacheKey = breakdownCacheKey(dimension, search);
    const cache = this.state.expandedBreakdown?.cache ?? {};
    const previousRows = cache[cacheKey];
    const previous = previousRows === undefined ? undefined : successState(previousRows);
    this.#set({ expandedBreakdown: { dimension, headline, search, cache, report: loadingState(previous) } });
    const run = (signal: AbortSignal) => this.#api.breakdown({
      path: { dimension },
      query,
      signal,
    });
    const result = await (options.debounce ? this.#expandedRequest.schedule(run) : this.#expandedRequest.run(run));
    const active = this.state.expandedBreakdown;
    if (result.status === "cancelled" || result.status === "stale"
      || active?.dimension !== dimension
      || active.search !== search) return;
    if (result.status === "error") {
      this.#set({ expandedBreakdown: { dimension, headline, search, cache: active.cache, report: errorState(reportErrorMessage(result.error), previous) } });
      return;
    }
    const { data, error, response } = result.value;
    const rows = data?.rows ?? [];
    const nextCache = error ? active.cache : { ...active.cache, [cacheKey]: rows };
    this.#set({ expandedBreakdown: { dimension, headline, search, cache: nextCache, report: error
      ? errorState(apiErrorMessage(error, response?.status ?? 0), previous)
      : successState(rows) } });
  }

  searchBreakdown(search: string): void {
    const expanded = this.state.expandedBreakdown;
    if (!expanded) return;
    const value = expanded.dimension === "Country" ? countrySearchValue(search, this.#environment.languages) : search;
    void this.openBreakdown(expanded.dimension, expanded.headline, {
      search: value,
      debounce: true,
    });
  }

  closeBreakdown(): void { this.#expandedRequest.cancel(); this.#set({ expandedBreakdown: undefined }); }

  #set(patch: Partial<DashboardState>): void { this.state = { ...this.state, ...patch }; this.#notify(); }

  #changeReportScope(patch: Partial<DashboardState>): void {
    this.#expandedRequest.cancel();
    this.features.closeDialogs();
    this.#set({
      ...patch,
      expandedBreakdown: undefined,
    });
    this.#syncUrlState();
    void this.loadReports();
  }

  async #initialize(): Promise<void> {
    this.#set({ configurationError: undefined, setupRequired: false });
    const initialized = this.#documentId
      ? await this.#initializeDocument(this.#documentId)
      : await this.#initializeGlobal();
    if (!initialized) return;
    this.#syncUrlState();
    await this.loadReports();
  }

  async #initializeDocument(documentId: string): Promise<boolean> {
    const result = await this.#initializationRequest.run((signal) => this.#api.documentRoutes({
      path: { documentId }, query: { culture: this.#culture }, signal,
    }));
    if (!this.#initializationSucceeded(result)) return false;
    const { data, error } = result.value;
    const routes = !error ? data ?? [] : [];
    const root = routes[0]?.documentRoot;
    const requested = routes.some((route) => route.connection === this.state.connection) ? this.state.connection : undefined;
    const stored = root ? this.#environment.getStoredDocumentConnection(root) : undefined;
    const storedValid = routes.some((route) => route.connection === stored) ? stored : undefined;
    const connection = requested ?? storedValid ?? routes[0]?.connection;
    const route = connection ? activeDocumentRoute(routes, this.#culture, connection) : undefined;
    if (!route) {
      this.#set({ configurationError: "This document is unpublished, unmapped, or its active culture is not configured for analytics.", summary: idleState() });
      return false;
    }
    this.#documentRoutes = routes;
    const connections = Array.from(new Map(routes.map((candidate) => [candidate.connection, {
      key: candidate.connection,
      displayName: candidate.displayName,
      provider: candidate.provider,
      capabilities: candidate.capabilities,
      isDefault: false,
      isConfigured: true,
      baseUrl: undefined,
      warnings: candidate.warnings,
    }])).values());
    const selection = normalizeDashboardSelection(this.state, route.capabilities);
    this.#set({ connections, route, connection: route.connection, provider: route.provider, capabilities: route.capabilities, ...selection });
    return true;
  }

  async #initializeGlobal(): Promise<boolean> {
    const result = await this.#initializationRequest.run((signal) => this.#api.connections({ signal }));
    if (!this.#initializationSucceeded(result)) return false;
    const { data, error } = result.value;
    if (error || !data?.enabled) {
      this.#set({ configurationError: "Web Analytics is disabled or unavailable. Ask an administrator to configure a connection.", summary: idleState() });
      return false;
    }
    if (data.connections.length === 0) {
      this.#set({ setupRequired: true, summary: idleState() });
      return false;
    }
    let { preset, range } = this.state;
    if (!this.#hasUrlDateState) {
      preset = [1, 7, 30, 90, 365].includes(data.defaultRangeDays) ? data.defaultRangeDays as Exclude<DatePreset, "custom"> : "custom";
      range = dateRangeForPreset(data.defaultRangeDays);
    }
    const stored = this.#environment.getStoredConnection();
    const requested = data.connections.some(({ key }) => key === this.state.connection) ? this.state.connection : undefined;
    const storedValid = data.connections.some(({ key }) => key === stored) ? stored ?? undefined : undefined;
    const connection = requested ?? storedValid ?? data.connections[0]?.key;
    const selectedConnection = data.connections.find(({ key }) => key === connection);
    const capabilities = selectedConnection?.capabilities ?? unavailableCapabilities;
    const selection = normalizeDashboardSelection(this.state, capabilities);
    this.#set({
      connections: data.connections,
      connection,
      provider: selectedConnection?.provider,
      capabilities,
      ...selection,
      preset,
      range,
    });
    return true;
  }

  #initializationSucceeded<T>(result: RequestResult<T>): result is Extract<RequestResult<T>, { status: "success" }> {
    if (result.status === "error") {
      this.#set({ configurationError: reportErrorMessage(result.error), summary: idleState() });
    }
    return result.status === "success";
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

  async #loadBreakdowns(): Promise<void> {
    const connection = this.state.connection;
    if (!connection) return;
    this.#expandedRequest.cancel();
    this.features.closeDialogs();
    this.#set({ expandedBreakdown: undefined });
    this.#utmRequest.cancel();
    const { dimensions } = this.#dashboardReportPlan();
    this.#set({
      breakdowns: Object.fromEntries(dimensions.map((dimension) => [dimension, loadingState(this.state.breakdowns[dimension])])),
    });
    const result = await this.#reportRequest.run((signal) => loadDashboardBreakdowns(
      this.#reportQuery(connection, this.#visitFilterQuery()),
      dimensions,
      signal,
      (update) => this.#applyReportUpdate(update),
      this.#api,
      this.state.metric,
      this.#capabilities().breakdownOrdering,
    ));
    if (result.status === "error") this.#failLoadingBreakdowns(reportErrorMessage(result.error), dimensions);
  }

  #failLoadingReports(message: string, dimensions: ReadonlyArray<AnalyticsDimension>): void {
    this.#set({
      summary: errorState(message, this.state.summary),
      events: errorState(message, this.state.events),
      flags: errorState(message, this.state.flags),
      breakdowns: Object.fromEntries(dimensions.map((dimension) => [dimension, errorState(message, this.state.breakdowns[dimension])])),
    });
  }

  #failLoadingBreakdowns(message: string, dimensions: ReadonlyArray<AnalyticsDimension>): void {
    this.#set({
      breakdowns: Object.fromEntries(dimensions.map((dimension) => [dimension, errorState(message, this.state.breakdowns[dimension])])),
    });
  }

  #dashboardReportPlan(utmCapability = this.state.utmCapability): DashboardReportPlan {
    const capabilities = this.#capabilities();
    const referrerDimension = capabilities.dimensions.includes("ReferrerHostname") ? "ReferrerHostname" : "Referrer";
    const plan = dashboardReportPlan(
      utmCapability,
      this.state.acquisitionView,
      this.state.utmDimension,
      referrerDimension,
    );
    const supported = new Set(capabilities.dimensions);
    const cards = plan.cards.reduce<DashboardCard[]>((result, card) => {
      if (card.kind === "breakdown") {
        if (supported.has(card.dimension)) result.push(card);
        return result;
      }
      const options = card.options.filter(({ dimension }) => supported.has(dimension));
      if (options.length) result.push({ ...card, options });
      return result;
    }, []);
    return { cards, dimensions: plan.dimensions.filter((dimension) => supported.has(dimension)) };
  }

  #capabilities(): AnalyticsCapabilities {
    return this.state.capabilities ?? unavailableCapabilities;
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
      this.state.metric,
      this.#capabilities().breakdownOrdering,
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

  #reportQuery(connection: string, filter: ReportFilterQuery): DashboardReportQuery {
    const { from, to, interval } = this.state.range;
    return { connection, from, to, interval, ...this.#scope(), ...filter };
  }

  #scope(): ReportScope {
    return this.#documentId && this.state.route
      ? {
        documentId: this.#documentId,
        culture: this.state.route.culture,
        path: this.state.route.path,
        includeChildPaths: this.state.includeChildPaths,
      }
      : {};
  }

  #serializedFilters(filters: AnalyticsFilter[]): { filter?: string[] } {
    return filters.length ? { filter: filters.map(serializeFilter) } : {};
  }

  #flagFilterQuery(): { filterFlagKey?: string; filterFlagValue?: string } {
    return this.state.flagFilter
      ? { filterFlagKey: this.state.flagFilter.flagKey, filterFlagValue: this.state.flagFilter.value }
      : {};
  }

  #eventFilterQuery(): Pick<DashboardReportQuery, "filterEventName" | "filterEventProperty" | "filterEventValue"> {
    const filter = this.state.eventFilter;
    return filter
      ? {
          filterEventName: filter.eventName,
          filterEventProperty: filter.property,
          filterEventValue: filter.value,
        }
      : {};
  }

  #visitFilterQuery(): ReportFilterQuery {
    return {
      ...this.#serializedFilters(this.#capabilities().globalEventFiltering
        ? this.state.filters
        : this.state.filters.filter(({ dimension }) => dimension !== "EventName")),
      ...this.#flagFilterQuery(),
      ...this.#eventFilterQuery(),
    };
  }

  #eventListFilterQuery(): ReportFilterQuery {
    return { ...this.#serializedFilters(this.state.filters), ...this.#flagFilterQuery(), ...this.#eventFilterQuery() };
  }

  #restoreUrlState(): void {
    const parsed = parseDashboardUrlState(this.#environment.currentUrl().searchParams);
    const patch: Partial<DashboardState> = {
      connection: parsed.connection,
      metric: parsed.metric,
      audienceDimension: parsed.audience,
      utmDimension: parsed.utm,
      filters: parsed.filters,
      flagFilter: parsed.flagFilter,
      eventFilter: parsed.eventFilter,
      includeChildPaths: parsed.includeChildPaths,
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
      flagFilter: this.state.flagFilter,
      eventFilter: this.state.eventFilter,
      includeChildPaths: this.state.includeChildPaths,
    }));
  }

}

function breakdownCacheKey(dimension: AnalyticsDimension, search: string): string {
  return JSON.stringify([dimension, search]);
}

function apiErrorMessage(error: unknown, status: number): string {
  return reportErrorMessage(typeof error === "object" && error !== null ? { ...error, status } : { status });
}
