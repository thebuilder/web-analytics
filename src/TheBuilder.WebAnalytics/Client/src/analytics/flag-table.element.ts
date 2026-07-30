import { LitElement, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import type { AnalyticsFlagRow } from "../api/types.gen.js";
import type { AnalyticsFlagFilter } from "./dashboard-url-state.js";
import { analyticsTableFilterActionStyles, renderAnalyticsFilterAction } from "./analytics-filter-action.js";
import { analyticsTableSkeletonStyles } from "./analytics-table-skeleton.js";
import { analyticsDrilldownFilterStyles, renderAnalyticsDrilldownFilter } from "./analytics-drilldown-filter.js";
import { analyticsMetricTableStyles, renderAnalyticsMetricTable } from "./analytics-metric-table.js";

const FLAGS_SETUP_URL = "https://vercel.com/docs/flags/observability/web-analytics";
export type FlagTableMode = "detail" | "list" | "overview";

@customElement("web-analytics-flag-table")
export class WebAnalyticsFlagTableElement extends UmbElementMixin(LitElement) {
  @property({ type: Boolean }) loading = false;
  @property() mode: FlagTableMode = "overview";
  @property({ attribute: false }) rows: AnalyticsFlagRow[] = [];
  @property() flagKey?: string;
  @property({ attribute: false }) flagFilter?: AnalyticsFlagFilter;

  #select(flagKey: string): void {
    this.dispatchEvent(new CustomEvent("select-flag", {
      bubbles: true,
      composed: true,
      detail: { flagKey },
    }));
  }

  render() {
    const rows = this.rows.filter(({ value }) => value !== "Others");
    const empty = !this.loading && rows.length === 0;
    const maximum = Math.max(...rows.map(({ pageViews }) => pageViews), 1);
    const body = rows.map((row) => {
            const activeFilter = this.flagKey === this.flagFilter?.flagKey && row.value === this.flagFilter?.value;
            const filterLabel = activeFilter
              ? `Remove ${this.flagKey} flag value filter ${row.value}`
              : `Filter analytics by ${this.flagKey} flag value ${row.value}`;
            return html`
            <tr>
              <th scope="row">
                <span class="bar" style=${`--bar-width:${(row.pageViews / maximum) * 100}%;--bar-minimum:${row.pageViews > 0 ? "4px" : "0px"}`}></span>
                <span class="row-heading-content">
                  ${this.mode !== "detail"
                    ? html`<button class="row-action" type="button" @click=${() => this.#select(row.value)}>${row.value}</button>`
                    : html`<span class="row-value">${row.value}</span>`}
                  ${this.mode === "overview" && this.flagFilter?.flagKey === row.value
                    ? renderAnalyticsDrilldownFilter({
                      label: this.flagFilter.value || "(empty)",
                      removeLabel: `Remove ${row.value} flag value filter ${this.flagFilter.value || "empty"}`,
                      remove: () => this.dispatchEvent(new CustomEvent("toggle-flag-filter", {
                        bubbles: true,
                        composed: true,
                        detail: this.flagFilter,
                      })),
                    })
                    : ""}
                </span>
              </th>
              <td><span class="metric-cell">
                ${this.mode === "detail" && this.flagKey ? renderAnalyticsFilterAction({
                  active: activeFilter,
                  label: filterLabel,
                  toggle: () => this.dispatchEvent(new CustomEvent("toggle-flag-filter", {
                    bubbles: true,
                    composed: true,
                    detail: { flagKey: this.flagKey, value: row.value },
                  })),
                }) : ""}
                <strong>${this.localize.number(row.visitors)}</strong>
              </span></td>
              <td><strong>${this.localize.number(row.pageViews)}</strong></td>
            </tr>
          `;});
    return html`
      ${renderAnalyticsMetricTable({
        caption: "Feature flags",
        rowHeading: "Flags",
        totalHeading: "Total",
        loading: this.loading,
        skeletonRows: 3,
        rows: body,
      })}
      ${empty ? html`
        <div class="empty">
          <span class="empty-icon"><uui-icon name="icon-flag" aria-hidden="true"></uui-icon></span>
          <strong>No flags</strong>
          <p>Track feature flags to understand how they affect visitor behaviour.</p>
          ${this.mode === "overview" ? html`
            <a href=${FLAGS_SETUP_URL} target="_blank" rel="noopener noreferrer">Set up flag tracking <uui-icon name="icon-out" aria-hidden="true"></uui-icon></a>
          ` : ""}
        </div>
      ` : ""}
    `;
  }

  static styles = [analyticsTableSkeletonStyles, analyticsMetricTableStyles, analyticsTableFilterActionStyles, analyticsDrilldownFilterStyles];
}

declare global { interface HTMLElementTagNameMap { "web-analytics-flag-table": WebAnalyticsFlagTableElement; } }
