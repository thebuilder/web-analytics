import { LitElement, customElement, html, nothing, property, state } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import type { AnalyticsDimension } from "../api/types.gen.js";
import { countryDisplayName, countryFlagUrl, normalizeCountryCode } from "./country-display.js";
import { breakdownValueIcon } from "./breakdown-value-icon.js";
import type { AnalyticsDateRangeChangeDetail } from "./date-range-picker.element.js";
import type { AnalyticsEventFilter, AnalyticsFilter, AnalyticsFlagFilter, AudienceDimension, DashboardMetric, UtmDimension } from "./dashboard-url-state.js";
import type { AcquisitionView } from "./dashboard-cards.js";
import { AnalyticsDashboardController, type DashboardState } from "./analytics-dashboard.controller.js";
import type { FeatureDrilldownState } from "./analytics-feature-drilldown.controller.js";
import { isInitialLoading, stateData, type AsyncState } from "./async-state.js";
import { analyticsDashboardStyles } from "./analytics-dashboard.styles.js";
import "./analytics-dashboard-header.element.js";
import "./analytics-summary.element.js";
import "./analytics-breakdown-grid.element.js";
import "./breakdown-dialog.element.js";
import "./event-dialog.element.js";
import "./flag-dialog.element.js";
import "./event-details-dialog.element.js";

@customElement("web-analytics-dashboard")
export class WebAnalyticsDashboardElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) documentId?: string;
  @property() culture?: string;
  @state() private _revision = 0;

  readonly #controller = new AnalyticsDashboardController(() => {
    this._revision += 1;
  });
  override connectedCallback(): void {
    super.connectedCallback();
    this.#controller.connect(this.documentId, this.culture);
  }

  override disconnectedCallback(): void {
    this.#controller.disconnect();
    super.disconnectedCallback();
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("documentId") || changed.has("culture")) {
      this.#controller.setScope(this.documentId, this.culture);
    }
  }

  #filterLabel(filter: AnalyticsFilter): string {
    if (filter.dimension === "Country") {
      const code = normalizeCountryCode(filter.value);
      if (code) return countryDisplayName(code, navigator.languages);
    }
    return filter.value;
  }

  #renderFilterIcon(filter: AnalyticsFilter) {
    const countryCode = filter.dimension === "Country" ? normalizeCountryCode(filter.value) : undefined;
    if (countryCode) {
      return html`<img class="filter-icon filter-flag" src=${countryFlagUrl(countryCode)} alt="" width="16" height="12" loading="lazy" referrerpolicy="no-referrer">`;
    }

    const valueIcon = breakdownValueIcon(filter.dimension, filter.value);
    if (valueIcon?.kind === "asset") {
      return html`<img class="filter-icon" src=${valueIcon.src} alt="" width="16" height="16" loading="lazy">`;
    }
    if (valueIcon?.kind === "native") {
      return html`<uui-icon class="filter-icon" name=${valueIcon.name} aria-hidden="true"></uui-icon>`;
    }
    return nothing;
  }

  #renderFilters(filters: AnalyticsFilter[], flagFilter?: AnalyticsFlagFilter, eventFilter?: AnalyticsEventFilter) {
    if (!filters.length && !flagFilter && !eventFilter) return "";
    return html`
      <section class="active-filters" aria-label="Active analytics filters">
        <div class="filter-heading"><uui-icon name="icon-filter" aria-hidden="true"></uui-icon><strong>Filters</strong></div>
        <div class="filter-list" role="group" aria-label="Applied filters">
          ${filters.map((filter) => html`
            <button
              type="button"
              class="filter-badge"
              aria-label=${`Remove filter ${this.#filterLabel(filter)}`}
              @click=${() => this.#controller.removeFilter(filter.dimension)}>
              ${this.#renderFilterIcon(filter)}
              <span class="filter-value">${this.#filterLabel(filter)}</span><span class="filter-remove" aria-hidden="true">×</span>
            </button>
          `)}
          ${flagFilter ? html`
            <button
              type="button"
              class="filter-badge"
              aria-label=${`Remove flag filter ${flagFilter.flagKey} ${flagFilter.value}`}
              @click=${() => this.#controller.removeFlagFilter()}>
              <uui-icon class="filter-icon" name="icon-flag" aria-hidden="true"></uui-icon>
              <span class="filter-value">${flagFilter.flagKey}: ${flagFilter.value}</span><span class="filter-remove" aria-hidden="true">×</span>
            </button>
          ` : ""}
          ${eventFilter ? html`
            <button
              type="button"
              class="filter-badge"
              aria-label=${`Remove event filter ${eventFilter.eventName} ${eventFilter.property} ${eventFilter.value}`}
              @click=${() => this.#controller.clearEventFilter()}>
              <uui-icon class="filter-icon" name="icon-calendar" aria-hidden="true"></uui-icon>
              <span class="filter-value">${eventFilter.eventName}: ${eventFilter.property} = ${eventFilter.value}</span><span class="filter-remove" aria-hidden="true">×</span>
            </button>
          ` : ""}
        </div>
        <uui-button class="clear-filters" look="secondary" compact label="Clear all analytics filters" @click=${() => this.#controller.clearFilters()}>Clear all</uui-button>
      </section>
    `;
  }

  #error<T>(state: AsyncState<T>): string | undefined {
    return state.status === "error" ? state.message : undefined;
  }

  #renderHeader(state: DashboardState) {
    return html`
      <web-analytics-dashboard-header
        .connections=${state.connections}
        .connection=${state.connection}
        .route=${state.route}
        .range=${state.range}
        .preset=${state.preset}
        .siteUrl=${this.#controller.linkBaseUrl()}
        .documentScoped=${Boolean(this.documentId)}
        .includeChildPaths=${state.includeChildPaths}
        @connection-change=${(event: CustomEvent<{ connection: string }>) => this.#controller.setConnection(event.detail.connection)}
        @include-child-paths-change=${(event: CustomEvent<{ includeChildPaths: boolean }>) => this.#controller.setIncludeChildPaths(event.detail.includeChildPaths)}
        @analytics-date-range-change=${(event: CustomEvent<AnalyticsDateRangeChangeDetail>) => this.#controller.setDateRange(event.detail.preset, event.detail.range)}></web-analytics-dashboard-header>
    `;
  }

  #renderBreakdownDialog(state: DashboardState) {
    const expanded = state.expandedBreakdown;
    if (!expanded) return nothing;
    return html`
      <web-analytics-breakdown-dialog
        .headline=${expanded.headline}
        .dimension=${expanded.dimension}
        .availableDimensions=${state.capabilities?.dimensions ?? []}
        .preferredUtmDimension=${state.utmDimension}
        .rows=${stateData(expanded.report) ?? []}
        .filters=${state.filters}
        .loading=${isInitialLoading(expanded.report)}
        aria-busy=${expanded.report.status === "loading" ? "true" : "false"}
        .unavailable=${this.#error(expanded.report)}
        .metric=${state.metric}
        .baseUrl=${this.#controller.linkBaseUrl()}
        .linkValues=${expanded.dimension === "RequestPath" || expanded.dimension === "Route"}
        @search-breakdown=${(event: CustomEvent<{ search: string }>) => this.#controller.searchBreakdown(event.detail.search)}
        @breakdown-dimension-change=${(event: CustomEvent<{ dimension: AnalyticsDimension; headline: string }>) => this.#controller.openBreakdown(event.detail.dimension, event.detail.headline)}
        @analytics-dialog-close=${() => this.#controller.closeBreakdown()}></web-analytics-breakdown-dialog>
    `;
  }

  #renderEventListDialog(state: DashboardState, features: FeatureDrilldownState) {
    const expanded = features.expandedEvents;
    if (!expanded || features.selectedEvent) return nothing;
    return html`
      <web-analytics-event-dialog
        .rows=${stateData(expanded) ?? []}
        .filters=${state.filters}
        .detailsEnabled=${state.capabilities?.eventDetails ?? false}
        .filteringEnabled=${state.capabilities?.globalEventFiltering ?? false}
        .loading=${isInitialLoading(expanded)}
        aria-busy=${expanded.status === "loading" ? "true" : "false"}
        .unavailable=${this.#error(expanded)}
        @search-events=${(event: CustomEvent<{ search: string }>) => this.#controller.features.openEvents(event.detail.search, true)}
        @select-event=${(event: CustomEvent<{ eventName: string }>) => this.#controller.features.selectEvent(event.detail.eventName)}
        @analytics-dialog-close=${() => this.#controller.features.closeEvents()}></web-analytics-event-dialog>
    `;
  }

  #renderFlagDialog(state: DashboardState, features: FeatureDrilldownState) {
    if (!features.expandedFlags && !features.selectedFlag) return nothing;
    return html`
      <web-analytics-flag-dialog
        .report=${features.expandedFlags ?? state.flags}
        .selected=${features.selectedFlag}
        .flagFilter=${state.flagFilter}
        @select-flag=${(event: CustomEvent<{ flagKey: string }>) => this.#controller.features.selectFlag(event.detail.flagKey)}
        @clear-selected-flag=${() => this.#controller.features.backToFlags()}
        @analytics-dialog-close=${() => this.#controller.features.closeFlagFlow()}></web-analytics-flag-dialog>
    `;
  }

  #renderEventDetailsDialog(state: DashboardState, features: FeatureDrilldownState) {
    const selected = features.selectedEvent;
    if (!selected || !state.capabilities?.eventDetails) return nothing;
    return html`
      <web-analytics-event-details-dialog
        .eventName=${selected.eventName}
        .propertiesEnabled=${state.capabilities.eventProperties}
        .filteringEnabled=${state.capabilities.globalEventPropertyFiltering}
        .details=${stateData(selected.details)}
        .loading=${isInitialLoading(selected.details)}
        .unavailable=${this.#error(selected.details)}
        .filterProperty=${selected.eventProperty}
        .filterValue=${selected.eventValue}
        .searchedProperty=${stateData(selected.property)}
        .searchedTerm=${selected.propertySearch}
        .searchLoading=${isInitialLoading(selected.property)}
        aria-busy=${selected.details.status === "loading" || selected.property.status === "loading" ? "true" : "false"}
        .searchUnavailable=${this.#error(selected.property)}
        @search-event-property=${(event: CustomEvent<{ propertyName: string; search: string }>) => this.#controller.features.searchEventProperty(event.detail.propertyName, event.detail.search)}
        @apply-event-property-filter=${(event: CustomEvent<{ property: string; value: string; visitors: number; count: number }>) => {
          const { property, value } = event.detail;
          this.#controller.features.applyEventFilter(property, value);
        }}
        @back-to-events=${() => this.#controller.features.backToEvents()}
        @analytics-dialog-close=${() => this.#controller.features.closeEventFlow()}></web-analytics-event-details-dialog>
    `;
  }

  render() {
    void this._revision;
    const state = this.#controller.state;
    const features = this.#controller.features.state;
    if (state.configurationError) return html`
      <main><umb-empty-state headline="Analytics is not available"><p>${state.configurationError}</p></umb-empty-state></main>
    `;
    if (state.setupRequired) return html`
      <main>
        <umb-empty-state headline="Connect Web Analytics">
          <p>Add an analytics connection before viewing reports.</p>
          <uui-button
            href="/umbraco/section/settings/dashboard/web-analytics"
            look="primary"
            label="Open Web Analytics settings">
            Open settings
          </uui-button>
        </umb-empty-state>
      </main>
    `;
    const activeConnection = state.connections.find(({ key }) => key === state.connection);
    if (activeConnection?.isConfigured === false) return html`
      <main>
        ${this.#renderHeader(state)}
        <div class="connection-setup-region">
          <section class="connection-setup" role="status" aria-labelledby="connection-setup-title">
            <uui-icon name="icon-alert" aria-hidden="true"></uui-icon>
            <div class="connection-setup-content">
              <h2 id="connection-setup-title">Connection credentials required</h2>
              <p>Add server-side credentials for this connection to load analytics reports.</p>
              <uui-button
                href="/umbraco/section/settings/dashboard/web-analytics"
                look="primary"
                label="Open Web Analytics connection settings">
                Open settings
              </uui-button>
            </div>
          </section>
        </div>
      </main>
    `;
    const capabilities = state.capabilities;
    return html`
      <main
        @toggle-filter=${(event: CustomEvent<{ dimension?: AnalyticsDimension; value: string }>) => this.#controller.toggleFilter(event.detail.dimension, event.detail.value)}
        @toggle-flag-filter=${(event: CustomEvent<AnalyticsFlagFilter>) => this.#controller.toggleFlagFilter(event.detail.flagKey, event.detail.value)}>
        ${this.#renderHeader(state)}
        ${this.#renderFilters(state.filters, state.flagFilter, state.eventFilter)}
        <web-analytics-summary
          .report=${state.summary}
          .range=${state.range}
          .metric=${state.metric}
          @metric-change=${(event: CustomEvent<{ metric: DashboardMetric }>) => this.#controller.setMetric(event.detail.metric)}
          @retry-summary=${() => this.#controller.retryReports()}></web-analytics-summary>
        <web-analytics-breakdown-grid
          .cards=${this.#controller.cards()}
          .breakdowns=${state.breakdowns}
          .events=${state.events}
          .flags=${state.flags}
          .filters=${state.filters}
          .eventFilter=${state.eventFilter}
          .flagFilter=${state.flagFilter}
          .metric=${state.metric}
          .audienceDimension=${state.audienceDimension}
          .acquisitionView=${state.acquisitionView}
          .utmDimension=${state.utmDimension}
          .baseUrl=${this.#controller.linkBaseUrl()}
          .supportsEvents=${capabilities?.events ?? false}
          .supportsEventDetails=${capabilities?.eventDetails ?? false}
          .supportsGlobalEventFiltering=${capabilities?.globalEventFiltering ?? false}
          .supportsFlags=${capabilities?.flags ?? false}
          @view-breakdown=${(event: CustomEvent<{ dimension: AnalyticsDimension; headline: string }>) => this.#controller.openBreakdown(event.detail.dimension, event.detail.headline)}
          @view-events=${() => this.#controller.features.openEvents()}
          @view-flags=${() => this.#controller.features.openFlags()}
          @select-event=${(event: CustomEvent<{ eventName: string }>) => this.#controller.features.selectEvent(event.detail.eventName)}
          @select-flag=${(event: CustomEvent<{ flagKey: string }>) => this.#controller.features.selectFlag(event.detail.flagKey)}
          @clear-event-filter=${() => this.#controller.clearEventFilter()}
          @retry-reports=${() => this.#controller.retryReports()}
          @audience-change=${(event: CustomEvent<{ dimension: AudienceDimension }>) => this.#controller.setAudienceDimension(event.detail.dimension)}
          @acquisition-change=${(event: CustomEvent<{ view: AcquisitionView }>) => this.#controller.setAcquisitionView(event.detail.view)}
          @utm-change=${(event: CustomEvent<{ dimension: UtmDimension }>) => this.#controller.setUtmDimension(event.detail.dimension)}></web-analytics-breakdown-grid>
        ${this.#renderBreakdownDialog(state)}
        ${this.#renderEventListDialog(state, features)}
        ${this.#renderFlagDialog(state, features)}
        ${this.#renderEventDetailsDialog(state, features)}
      </main>
    `;
  }

  static styles = analyticsDashboardStyles;
}

declare global { interface HTMLElementTagNameMap { "web-analytics-dashboard": WebAnalyticsDashboardElement; } }
