import { LitElement, customElement, html, nothing, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import type { AnalyticsEventRow } from "../api/types.gen.js";
import type { AnalyticsEventFilter, AnalyticsFilter } from "./dashboard-url-state.js";
import { visibleEventRows } from "./event-rows.js";
import { analyticsTableSkeletonStyles } from "./analytics-table-skeleton.js";
import { analyticsRowFilterStyles, isPlainRowClick } from "./analytics-filter-action.js";
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
  @property({ type: Boolean }) cardHeading = false;

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
      // A row opens the event's details on every provider. Filtering by the event, or by one of its
      // property values, happens inside the details where the provider supports it.
      const showDetails = this.detailsEnabled ? () => this.#select(row.eventName) : undefined;
      const label = showDetails
        ? html`<button class="row-value row-filter" type="button" aria-pressed=${activeFilter} title=${`View details for ${row.eventName}`} @click=${showDetails}>${row.eventName}</button>`
        : html`<span class="row-value">${row.eventName}</span>`;
      return html`
        <tr class=${showDetails ? "filter-row" : ""} @click=${(event: Event) => { if (showDetails && isPlainRowClick(event, this.shadowRoot)) showDetails(); }}>
          <th scope="row">
            <span class="bar" style=${`--bar-width:${(row.count / maximum) * 100}%;--bar-minimum:${row.count > 0 ? "4px" : "0px"}`}></span>
            <span class="row-heading-content">
              ${label}
              ${eventFilter ? renderAnalyticsDrilldownFilter({
                label: `${eventFilter.property}: ${eventFilter.value || "(empty)"}`,
                removeLabel: `Remove ${row.eventName} ${eventFilter.property} filter ${eventFilter.value || "empty"}`,
                remove: () => this.dispatchEvent(new CustomEvent("clear-event-filter", {
                  bubbles: true,
                  composed: true,
                })),
              }) : nothing}
            </span>
          </th>
          <td><strong class="metric-value">${this.localize.number(row.visitors)}</strong></td>
          <td><strong class="metric-value">${this.localize.number(row.count)}</strong></td>
        </tr>
      `;
    });
    return html`
      ${renderAnalyticsMetricTable({
        caption: "Events",
        heading: this.cardHeading ? "Events" : undefined,
        rowHeading: this.cardHeading ? "Event" : "Events",
        totalHeading: this.cardHeading ? "Total" : "Total events",
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

  static styles = [analyticsTableSkeletonStyles, analyticsMetricTableStyles, analyticsRowFilterStyles, analyticsDrilldownFilterStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "web-analytics-event-table": WebAnalyticsEventTableElement;
  }
}
