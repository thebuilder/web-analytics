import { LitElement, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import type { AnalyticsEventRow } from "../api/types.gen.js";
import type { AnalyticsEventFilter, AnalyticsFilter } from "./dashboard-url-state.js";
import { visibleEventRows } from "./event-rows.js";
import { analyticsTableSkeletonStyles } from "./analytics-table-skeleton.js";
import { analyticsTableFilterActionStyles, renderAnalyticsFilterAction } from "./analytics-filter-action.js";
import { analyticsMetricTableStyles, renderAnalyticsMetricTable } from "./analytics-metric-table.js";
import {
  analyticsDrilldownFilterStyles,
  renderAnalyticsDrilldownFilter,
} from "./analytics-drilldown-filter.js";

@customElement("web-analytics-event-table")
export class WebAnalyticsEventTableElement extends UmbElementMixin(LitElement) {
  @property({ type: Boolean }) loading = false;
  @property({ type: Number }) skeletonRows = 10;
  @property({ attribute: false }) rows: AnalyticsEventRow[] = [];
  @property({ attribute: false }) filters: AnalyticsFilter[] = [];
  @property({ attribute: false }) eventFilter?: AnalyticsEventFilter;
  @property({ type: Boolean }) detailsEnabled = true;
  @property({ type: Boolean }) filteringEnabled = false;

  #select(eventName: string): void {
    this.dispatchEvent(new CustomEvent("select-event", {
      bubbles: true,
      composed: true,
      detail: { eventName },
    }));
  }

  render() {
    const rows = visibleEventRows(this.rows);
    const empty = !this.loading && rows.length === 0;
    const maximum = Math.max(...rows.map((row) => row.count), 1);
    const body = rows.map((row) => {
              const activeFilter = this.filters.some((filter) => filter.dimension === "EventName" && filter.value === row.eventName);
              const eventFilter = this.eventFilter?.eventName === row.eventName
                ? this.eventFilter
                : undefined;
              const filterLabel = activeFilter ? `Remove ${row.eventName} event filter` : `Filter analytics by ${row.eventName} event`;
              return html`
              <tr>
                <th scope="row">
                  <span class="bar" style=${`--bar-width:${(row.count / maximum) * 100}%;--bar-minimum:${row.count > 0 ? "4px" : "0px"}`}></span>
                  <span class="row-heading-content">
                    ${this.detailsEnabled
                      ? html`<button class="row-action" type="button" title=${`View details for ${row.eventName}`} @click=${() => this.#select(row.eventName)}>${row.eventName}</button>`
                      : html`<span class="row-value">${row.eventName}</span>`}
                    ${eventFilter ? renderAnalyticsDrilldownFilter({
                      label: `${eventFilter.property}: ${eventFilter.value || "(empty)"}`,
                      removeLabel: `Remove ${row.eventName} ${eventFilter.property} filter ${eventFilter.value || "empty"}`,
                      remove: () => this.dispatchEvent(new CustomEvent("clear-event-filter", {
                        bubbles: true,
                        composed: true,
                      })),
                    }) : ""}
                  </span>
                </th>
                <td><span class="metric-cell">
                  ${this.filteringEnabled ? renderAnalyticsFilterAction({
                    active: activeFilter,
                    label: filterLabel,
                    toggle: () => this.dispatchEvent(new CustomEvent("toggle-filter", {
                      bubbles: true,
                      composed: true,
                      detail: { dimension: "EventName", value: row.eventName },
                    })),
                  }) : ""}
                  <strong class="metric-value">${this.localize.number(row.visitors)}</strong>
                </span></td>
                <td><strong class="metric-value">${this.localize.number(row.count)}</strong></td>
              </tr>
            `;});
    return html`
      ${renderAnalyticsMetricTable({
        caption: "Events",
        rowHeading: "Event",
        totalHeading: "Total events",
        loading: this.loading,
        skeletonRows: this.skeletonRows,
        rows: body,
      })}
      ${empty ? html`
        <div class="empty">
          <span class="empty-icon"><uui-icon name="icon-lightning" aria-hidden="true"></uui-icon></span>
          <strong>No events</strong>
          <p>Configure events or goals to understand which actions visitors take.</p>
        </div>
      ` : ""}
    `;
  }

  static styles = [analyticsTableSkeletonStyles, analyticsMetricTableStyles, analyticsTableFilterActionStyles, analyticsDrilldownFilterStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "web-analytics-event-table": WebAnalyticsEventTableElement;
  }
}
