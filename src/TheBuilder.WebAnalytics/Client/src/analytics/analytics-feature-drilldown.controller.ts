import type {
  AnalyticsCapabilities,
  AnalyticsEventProperty,
  AnalyticsEventRow,
  AnalyticsFlagsReport,
} from "../api/types.gen.js";
import { errorState, idleState, loadingState, successState, type AsyncState } from "./async-state.js";
import type { DashboardApi } from "./dashboard-api.js";
import type { SelectedEvent, SelectedFlag } from "./dashboard-drilldown-state.js";
import type { AnalyticsEventFilter } from "./dashboard-url-state.js";
import type { DashboardReportQuery } from "./dashboard-report-loader.js";
import { visibleEventRows } from "./event-rows.js";
import { reportErrorMessage } from "./report-error.js";
import { DebouncedRequest, RequestCoordinator } from "./request-coordinator.js";

export type FeatureDrilldownState = {
  expandedEvents?: AsyncState<AnalyticsEventRow[]>;
  selectedEvent?: SelectedEvent;
  expandedFlags?: AsyncState<AnalyticsFlagsReport>;
  selectedFlag?: SelectedFlag;
};

type FeatureDrilldownContext = {
  capabilities: AnalyticsCapabilities;
  visitQuery?: DashboardReportQuery;
  eventListQuery?: DashboardReportQuery;
  eventFilter?: AnalyticsEventFilter;
};

export class AnalyticsFeatureDrilldownController {
  state: FeatureDrilldownState = {};

  readonly #eventSearchRequest = new DebouncedRequest();
  readonly #eventDetailsRequest = new RequestCoordinator();
  readonly #eventPropertyRequest = new DebouncedRequest();
  readonly #flagListRequest = new RequestCoordinator();
  readonly #flagDetailsRequest = new RequestCoordinator();
  readonly #notify: () => void;
  readonly #api: DashboardApi;
  readonly #getContext: () => FeatureDrilldownContext;
  readonly #applyEventFilter: (filter: AnalyticsEventFilter | undefined) => void;

  constructor(
    notify: () => void,
    api: DashboardApi,
    getContext: () => FeatureDrilldownContext,
    applyEventFilter: (filter: AnalyticsEventFilter | undefined) => void,
  ) {
    this.#notify = notify;
    this.#api = api;
    this.#getContext = getContext;
    this.#applyEventFilter = applyEventFilter;
  }

  async openEvents(search = "", debounce = false): Promise<void> {
    const { capabilities, eventListQuery } = this.#getContext();
    if (!capabilities.events || !eventListQuery) return;
    const previous = this.state.expandedEvents;
    this.#set({ expandedEvents: loadingState(previous) });
    const run = (signal: AbortSignal) => this.#api.events({
      query: { ...eventListQuery, limit: 100, search: search || undefined },
      signal,
    });
    const result = await (debounce ? this.#eventSearchRequest.schedule(run) : this.#eventSearchRequest.run(run));
    if (result.status === "cancelled" || result.status === "stale" || !this.state.expandedEvents) return;
    if (result.status === "error") {
      this.#set({ expandedEvents: errorState(reportErrorMessage(result.error), previous) });
      return;
    }
    const { data, error, response } = result.value;
    this.#set({
      expandedEvents: error
        ? errorState(apiErrorMessage(error, response?.status ?? 0), previous)
        : successState(visibleEventRows(data?.rows ?? [])),
    });
  }

  closeEvents(): void {
    this.#eventSearchRequest.cancel();
    this.#set({ expandedEvents: undefined });
  }

  async selectEvent(eventName: string): Promise<void> {
    const { capabilities, eventFilter } = this.#getContext();
    if (!capabilities.eventDetails) return;
    const drilldown = eventFilter?.eventName === eventName
      ? eventFilter
      : undefined;
    await this.#loadEventDetails(eventName, drilldown?.property, drilldown?.value);
  }

  applyEventFilter(property: string, value: string): void {
    const { capabilities, eventFilter } = this.#getContext();
    const selected = this.state.selectedEvent;
    if (!selected || !capabilities.globalEventPropertyFiltering) return;
    const active = eventFilter?.eventName === selected.eventName
      && eventFilter.property === property
      && eventFilter.value === value;
    this.#applyEventFilter(active ? undefined : { eventName: selected.eventName, property, value });
  }

  searchEventProperty(propertyName: string, search: string): void {
    const { capabilities } = this.#getContext();
    if (!this.state.selectedEvent || !capabilities.eventProperties) return;
    const normalizedSearch = search.trim();
    void this.#loadEventPropertyValues(propertyName, normalizedSearch, normalizedSearch.length > 0);
  }

  closeEventDetails(): void {
    this.#eventPropertyRequest.cancel();
    this.#eventDetailsRequest.cancel();
    this.#set({ selectedEvent: undefined });
  }

  async backToEvents(): Promise<void> {
    const eventsAreOpen = this.state.expandedEvents !== undefined;
    this.closeEventDetails();
    if (!eventsAreOpen) await this.openEvents();
  }

  closeEventFlow(): void {
    this.#eventPropertyRequest.cancel();
    this.#eventDetailsRequest.cancel();
    this.#eventSearchRequest.cancel();
    this.#set({ selectedEvent: undefined, expandedEvents: undefined });
  }

  async openFlags(): Promise<void> {
    const { capabilities, visitQuery } = this.#getContext();
    if (!capabilities.flags || !visitQuery) return;
    const previous = this.state.expandedFlags;
    this.#set({ expandedFlags: loadingState(previous) });
    const result = await this.#flagListRequest.run((signal) => this.#api.flags({
      query: { ...visitQuery, limit: 100 },
      signal,
    }));
    if (result.status === "cancelled" || result.status === "stale" || !this.state.expandedFlags) return;
    if (result.status === "error") {
      this.#set({ expandedFlags: errorState(reportErrorMessage(result.error), previous) });
      return;
    }
    const { data, error, response } = result.value;
    this.#set({
      expandedFlags: error || !data
        ? errorState(apiErrorMessage(error, response?.status ?? 0), previous)
        : successState(data),
    });
  }

  async selectFlag(flagKey: string): Promise<void> {
    const { capabilities, visitQuery } = this.#getContext();
    if (!capabilities.flags || !visitQuery) return;
    const previous = this.state.selectedFlag?.flagKey === flagKey
      ? this.state.selectedFlag.report
      : undefined;
    this.#set({ selectedFlag: { flagKey, report: loadingState(previous) } });
    const result = await this.#flagDetailsRequest.run((signal) => this.#api.flags({
      query: { ...visitQuery, flagKey, limit: 100 },
      signal,
    }));
    if (result.status === "cancelled" || result.status === "stale" || this.state.selectedFlag?.flagKey !== flagKey) return;
    if (result.status === "error") {
      this.#set({ selectedFlag: { flagKey, report: errorState(reportErrorMessage(result.error), previous) } });
      return;
    }
    const { data, error, response } = result.value;
    this.#set({
      selectedFlag: {
        flagKey,
        report: error || !data
          ? errorState(apiErrorMessage(error, response?.status ?? 0), previous)
          : successState(data),
      },
    });
  }

  clearSelectedFlag(): void {
    this.#flagDetailsRequest.cancel();
    this.#set({ selectedFlag: undefined });
  }

  async backToFlags(): Promise<void> {
    const flagsAreOpen = this.state.expandedFlags !== undefined;
    this.clearSelectedFlag();
    if (!flagsAreOpen) await this.openFlags();
  }

  closeFlagFlow(): void {
    this.#flagListRequest.cancel();
    this.#flagDetailsRequest.cancel();
    this.#set({ expandedFlags: undefined, selectedFlag: undefined });
  }

  closeDialogs(): void {
    this.#cancelRequests();
    this.#set({
      expandedEvents: undefined,
      selectedEvent: undefined,
      expandedFlags: undefined,
      selectedFlag: undefined,
    });
  }

  closeAll(): void {
    this.#cancelRequests();
    this.#set({
      expandedEvents: undefined,
      selectedEvent: undefined,
      expandedFlags: undefined,
      selectedFlag: undefined,
    });
  }

  disconnect(): void {
    this.#cancelRequests();
  }

  async #loadEventDetails(eventName: string, eventProperty?: string, eventValue?: string): Promise<void> {
    const { visitQuery } = this.#getContext();
    if (!visitQuery) return;
    this.#eventPropertyRequest.cancel();
    const previous = this.state.selectedEvent?.eventName === eventName
      ? this.state.selectedEvent.details
      : undefined;
    this.#set({
      selectedEvent: {
        eventName,
        eventProperty,
        eventValue,
        details: loadingState(previous),
        property: idleState(),
        propertyCache: {},
      },
    });
    const result = await this.#eventDetailsRequest.run((signal) => this.#api.eventDetails({
      query: { ...visitQuery, eventName, eventProperty, eventValue },
      signal,
    }));
    if (result.status === "cancelled" || result.status === "stale" || this.state.selectedEvent?.eventName !== eventName) return;
    if (result.status === "error") {
      this.#set({
        selectedEvent: {
          ...this.state.selectedEvent,
          details: errorState(reportErrorMessage(result.error), previous),
        },
      });
      return;
    }
    const { data, error, response } = result.value;
    if (error || !data) {
      this.#set({
        selectedEvent: {
          ...this.state.selectedEvent,
          details: errorState(apiErrorMessage(error, response?.status ?? 0), previous),
        },
      });
      return;
    }
    const propertyCache = Object.fromEntries(data.properties
      .filter((property) => property.values.length > 0)
      .map((property) => [eventPropertyCacheKey(property.name, ""), property]));
    this.#set({
      selectedEvent: {
        ...this.state.selectedEvent,
        details: successState(data),
        propertyCache,
      },
    });
    const firstProperty = data.properties[0];
    if (this.#getContext().capabilities.eventProperties && firstProperty && !firstProperty.values.length) {
      void this.#loadEventPropertyValues(firstProperty.name, "");
    }
  }

  async #loadEventPropertyValues(propertyName: string, search: string, debounce = false): Promise<void> {
    const { capabilities, visitQuery } = this.#getContext();
    const selected = this.state.selectedEvent;
    if (!visitQuery || !selected || !capabilities.eventProperties) return;
    const cacheKey = eventPropertyCacheKey(propertyName, search);
    const cached = selected.propertyCache[cacheKey];
    const property = cached ? loadingState(successState(cached)) : loadingState<AnalyticsEventProperty>();
    this.#set({ selectedEvent: { ...selected, propertyName, propertySearch: search, property } });
    const run = (signal: AbortSignal) => this.#api.eventPropertyValues({
      query: {
        ...visitQuery,
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
    if (result.status === "cancelled" || result.status === "stale"
      || current?.eventName !== selected.eventName
      || current.propertyName !== propertyName) return;
    if (result.status === "error") {
      this.#set({ selectedEvent: { ...current, property: errorState(reportErrorMessage(result.error), property) } });
      return;
    }
    const { data, error, response } = result.value;
    this.#set({
      selectedEvent: {
        ...current,
        property: error || !data
          ? errorState(apiErrorMessage(error, response?.status ?? 0), property)
          : successState(data),
        propertyCache: !error && data
          ? { ...current.propertyCache, [cacheKey]: data }
          : current.propertyCache,
      },
    });
  }

  #cancelRequests(): void {
    this.#eventSearchRequest.cancel();
    this.#eventDetailsRequest.cancel();
    this.#eventPropertyRequest.cancel();
    this.#flagListRequest.cancel();
    this.#flagDetailsRequest.cancel();
  }

  #set(patch: Partial<FeatureDrilldownState>): void {
    this.state = { ...this.state, ...patch };
    this.#notify();
  }
}

function eventPropertyCacheKey(propertyName: string, search: string): string {
  return JSON.stringify([propertyName, search]);
}

function apiErrorMessage(error: unknown, status: number): string {
  return reportErrorMessage(typeof error === "object" && error !== null ? { ...error, status } : { status });
}
