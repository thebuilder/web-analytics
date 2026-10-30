import { LitElement, css, customElement, html, nothing, property } from "@umbraco-cms/backoffice/external/lit";
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
      const detailsLabel = `View details for ${row.eventName}`;
      const showDetails = () => this.#select(row.eventName);
      // Where the provider can filter by event, the row filters like every other breakdown and the
      // details move behind a hover icon. Otherwise the row opens the details.
      const rowAction = this.filteringEnabled
        ? () => this.dispatchEvent(new CustomEvent("toggle-filter", {
          bubbles: true,
          composed: true,
          detail: { dimension: "EventName", value: row.eventName },
        }))
        : this.detailsEnabled ? showDetails : undefined;
      const label = this.filteringEnabled
        ? html`<button class="row-value row-filter" type="button" aria-pressed=${activeFilter} title=${activeFilter ? `Remove ${row.eventName} event filter` : `Filter analytics by ${row.eventName} event`} @click=${rowAction}>${row.eventName}</button>`
        : rowAction
          ? html`<button class="row-value row-filter" type="button" title=${detailsLabel} @click=${rowAction}>${row.eventName}</button>`
          : html`<span class="row-value">${row.eventName}</span>`;
      return html`
        <tr class=${rowAction ? "filter-row" : ""} @click=${(event: Event) => { if (rowAction && isPlainRowClick(event, this.shadowRoot)) rowAction(); }}>
          <th scope="row">
            <span class="bar" style=${`--bar-width:${(row.count / maximum) * 100}%;--bar-minimum:${row.count > 0 ? "4px" : "0px"}`}></span>
            <span class="row-heading-content">
              ${label}
              ${this.filteringEnabled && this.detailsEnabled
                ? html`<button class="details-link" type="button" title=${detailsLabel} @click=${showDetails}><uui-icon name="icon-list" aria-hidden="true"></uui-icon><span class="visually-hidden">${detailsLabel}</span></button>`
                : nothing}
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
        rowHeading: "Events",
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

  static styles = [analyticsTableSkeletonStyles, analyticsMetricTableStyles, analyticsRowFilterStyles, analyticsDrilldownFilterStyles, css`
    .details-link { align-items: center; appearance: none; background: transparent; border: 0; border-radius: var(--uui-border-radius); color: var(--uui-color-text-alt); cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: var(--uui-type-small-size); justify-content: center; opacity: 0.6; padding: var(--uui-size-space-1); position: relative; transition: opacity 150ms ease-out; z-index: 1; }
    tbody tr:hover .details-link, .details-link:focus-visible { opacity: 1; }
    .details-link:hover { color: var(--uui-color-interactive-emphasis); }
    .details-link:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .details-link { transition: none; } }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "web-analytics-event-table": WebAnalyticsEventTableElement;
  }
}
