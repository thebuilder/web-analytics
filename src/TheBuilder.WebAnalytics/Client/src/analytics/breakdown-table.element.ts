import { LitElement, css, customElement, html, nothing, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import type { AnalyticsBreakdownRow, AnalyticsDimension } from "../api/types.gen.js";
import {
  analyticsRowHref,
  breakdownBarRatio,
  breakdownDisplayValue,
  breakdownMetricTotal,
  breakdownMetricValue,
  breakdownPercentage,
  isPercentageDimension,
  referrerExternalHref,
  visibleBreakdownRows,
  type TrafficMetric,
} from "./breakdown-rows.js";
import { countryDisplayName, countryFlagUrl, normalizeCountryCode } from "./country-display.js";
import { breakdownValueIcon } from "./breakdown-value-icon.js";
import type { AnalyticsFilter } from "./dashboard-url-state.js";
import { googleFaviconUrl } from "./favicon.js";
import { renderReportTabs, reportTabsStyles, selectedReportTabId, type ReportTabGroup } from "./report-tabs.js";

const BREAKDOWN_PANEL_ID = "breakdown-report-panel";

@customElement("web-analytics-breakdown-table")
export class WebAnalyticsBreakdownTableElement extends UmbElementMixin(LitElement) {
  @property() headline = "Breakdown";
  @property() rowLabel?: string;
  @property() emptyMessage = "No traffic was recorded for this breakdown.";
  @property() unavailable?: string;
  @property() baseUrl?: string;
  @property() dimension?: AnalyticsDimension;
  @property() metric: TrafficMetric = "visitors";
  @property({ type: Boolean }) loading = false;
  @property({ type: Boolean }) linkValues = false;
  @property({ type: Boolean }) compact = false;
  @property({ type: Number }) skeletonRows = 10;
  @property({ type: Number }) total = 0;
  @property({ attribute: false }) rows: AnalyticsBreakdownRow[] = [];
  @property({ attribute: false }) filters: AnalyticsFilter[] = [];
  @property({ attribute: false }) headingTabs?: ReportTabGroup;
  @property({ attribute: false }) subheadingTabs?: ReportTabGroup;

  render() {
    const percentageMode = this.compact && isPercentageDimension(this.dimension);
    if (this.loading) {
      return html`
        <span class="visually-hidden" role="status">Loading ${this.headline}</span>
        <table id=${BREAKDOWN_PANEL_ID} class="skeleton-table" aria-hidden="true">
          <caption>${this.headline}</caption>
          ${this.#renderHeading()}
          <tbody>${Array.from({ length: this.skeletonRows }, () => html`
            <tr>
              <th scope="row"><span class="skeleton-line"></span></th>
              <td><span class="skeleton-number"></span></td>
              ${this.compact ? nothing : html`<td><span class="skeleton-number"></span></td>`}
            </tr>
          `)}</tbody>
        </table>
      `;
    }
    const rows = visibleBreakdownRows(this.rows);
    const maximum = Math.max(...rows.map((row) => breakdownMetricValue(row, this.metric)), 1);
    const percentageTotal = this.total > 0 ? this.total : breakdownMetricTotal(rows, this.metric);
    const visitorTotal = breakdownMetricTotal(rows, "visitors");
    const message = this.unavailable ?? (rows.length === 0 ? this.emptyMessage : undefined);

    const labelledBy = [this.headingTabs, this.subheadingTabs]
      .map((group) => group ? selectedReportTabId(group) : undefined)
      .filter(Boolean)
      .join(" ");
    return html`
      <table id=${BREAKDOWN_PANEL_ID} class=${this.compact ? "compact-table" : nothing} aria-labelledby=${labelledBy || nothing}>
        <caption>${this.headline}</caption>
        ${this.#renderHeading()}
        <tbody>${message ? html`
          <tr class="message-row"><td colspan=${this.compact ? "2" : "3"}><p>${message}</p></td></tr>
        ` : rows.map((row, index) => {
          const isReferrer = this.dimension === "ReferrerHostname" || this.dimension === "Referrer";
          const href = isReferrer
            ? referrerExternalHref(row.value)
            : this.linkValues
              ? analyticsRowHref(this.baseUrl, row.value)
              : undefined;
          const countryCode = this.dimension === "Country" ? normalizeCountryCode(row.value) : undefined;
          const faviconUrl = isReferrer && href ? googleFaviconUrl(row.value) : undefined;
          const valueIcon = breakdownValueIcon(this.dimension, row.value);
          const hasValueIconFallback = this.dimension === "BrowserName" || this.dimension === "DeviceType" || this.dimension === "OsName";
          const displayValue = countryCode
            ? countryDisplayName(countryCode, navigator.languages)
            : breakdownDisplayValue(row.value, this.dimension);
          const metricValue = breakdownMetricValue(row, this.metric);
          const barRatio = breakdownBarRatio(metricValue, maximum);
          const percentage = breakdownPercentage(
            metricValue,
            percentageTotal,
            (value, options) => this.localize.number(value, options),
          );
          const visitorPercentage = breakdownPercentage(
            row.visitors,
            visitorTotal,
            (value, options) => this.localize.number(value, options),
          );
          const tooltipId = `breakdown-value-${index}`;
          const activeFilter = this.filters.some((filter) => filter.dimension === this.dimension && filter.value === row.value);
          const filterLabel = activeFilter ? `Remove ${displayValue} filter` : `Filter analytics by ${displayValue}`;
          const filterAction = html`
            <button
              class="filter-action"
              type="button"
              aria-label=${filterLabel}
              aria-pressed=${activeFilter}
              title=${filterLabel}
              @click=${() => this.dispatchEvent(new CustomEvent("toggle-filter", {
                bubbles: true,
                composed: true,
                detail: { dimension: this.dimension, value: row.value },
              }))}>
              <uui-icon name="icon-filter" aria-hidden="true"></uui-icon>
            </button>`;
          const expandedPercentageMode = !this.compact && isPercentageDimension(this.dimension);
          const expandedPercentage = expandedPercentageMode
            ? html`<span class="metric-share" title=${`${visitorPercentage.precise} of visitors`}>${visitorPercentage.display}</span>`
            : nothing;
          return html`
          <tr>
            <th scope="row">
              <span class="bar" style=${`--bar-width:${barRatio * 100}%;--bar-minimum:${metricValue > 0 ? "4px" : "0px"}`}></span>
              <span class="row-value">
                ${countryCode ? html`<img class="country-flag" src=${countryFlagUrl(countryCode)} alt="" width="20" height="15" loading="lazy" referrerpolicy="no-referrer" @error=${(event: Event) => ((event.currentTarget as HTMLImageElement).style.visibility = "hidden")}>` : ""}
                ${faviconUrl ? html`<img class="referrer-favicon" src=${faviconUrl} alt="" width="20" height="20" loading="lazy" referrerpolicy="no-referrer" @error=${(event: Event) => ((event.currentTarget as HTMLImageElement).hidden = true)}>` : ""}
                ${valueIcon?.kind === "asset"
                  ? html`<img class="breakdown-value-icon" src=${valueIcon.src} alt="" width="20" height="20" loading="lazy">`
                  : valueIcon?.kind === "native"
                    ? html`<uui-icon class="breakdown-value-icon" name=${valueIcon.name} aria-hidden="true"></uui-icon>`
                  : hasValueIconFallback
                    ? html`<uui-icon class="breakdown-value-icon breakdown-value-icon-fallback" name="icon-globe" aria-hidden="true"></uui-icon>`
                    : nothing}
                <span class="row-label" title=${displayValue}>${href
                  ? html`<a href=${href} target="_blank" rel="noopener noreferrer"><span class="link-label">${displayValue}</span><uui-icon class="external-indicator" name="icon-out" aria-hidden="true"></uui-icon><span class="visually-hidden"> (opens in a new tab)</span></a>`
                  : displayValue}</span>
              </span>
            </th>
            ${percentageMode ? html`
              <td>
                <span class="metric-cell">
                  ${filterAction}
                  <span class="percentage-value" tabindex="0" aria-describedby=${tooltipId}>
                    <span aria-hidden="true">${percentage.display}</span>
                    <span class="visually-hidden">${this.localize.number(metricValue)} ${this.#metricLabel().toLocaleLowerCase()}, ${percentage.precise} of the total</span>
                    <span id=${tooltipId} class=${`percentage-tooltip${index === 0 ? " below" : ""}`} role="tooltip">
                      <strong>${this.localize.number(metricValue)}</strong>
                      <span>${percentage.precise}</span>
                    </span>
                  </span>
                </span>
              </td>
            ` : this.compact ? html`
              <td><span class="metric-cell">${filterAction}<span class="metric-number">${this.localize.number(metricValue)}</span></span></td>
            ` : html`
              <td><span class="metric-cell">${this.metric === "visitors" || expandedPercentageMode ? filterAction : nothing}${expandedPercentage}<span class="metric-number">${this.localize.number(row.visitors)}</span></span></td>
              <td><span class="metric-cell">${this.metric === "pageViews" && !expandedPercentageMode ? filterAction : nothing}<span class="metric-number">${this.localize.number(row.pageViews)}</span></span></td>
            `}
          </tr>
        `;})}</tbody>
      </table>
    `;
  }

  #metricLabel(): string {
    return this.metric === "visitors" ? "Visitors" : "Page views";
  }

  #renderHeading() {
    return html`
      <thead>
        <tr>
          <th scope="col">${this.headingTabs
            ? renderReportTabs(this.headingTabs, (value) => this.dispatchEvent(new CustomEvent("heading-tab-change", {
                bubbles: true,
                composed: true,
                detail: { value },
              })), BREAKDOWN_PANEL_ID)
            : this.rowLabel ?? this.headline}</th>
          ${this.compact
            ? html`<th scope="col">${this.#metricLabel()}</th>`
            : html`<th scope="col">Visitors</th><th scope="col">Page views</th>`}
        </tr>
        ${this.subheadingTabs ? html`
          <tr class="subheading-row"><th scope="col" colspan=${this.compact ? "2" : "3"}>${this.subheadingTabs
            ? renderReportTabs(this.subheadingTabs, (value) => this.dispatchEvent(new CustomEvent("subheading-tab-change", {
                bubbles: true,
                composed: true,
                detail: { value },
              })), BREAKDOWN_PANEL_ID)
            : ""}</th></tr>
        ` : ""}
      </thead>
    `;
  }

  static styles = [reportTabsStyles, css`
    :host { display: block; overflow: visible; }
    table {
      --bar-inset: var(--uui-size-space-3);
      --metric-column-width: 8.5rem;
      --metric-columns-width: var(--metric-column-width);
      border-collapse: collapse;
      min-inline-size: min(20rem, 100%);
      table-layout: fixed;
      width: 100%;
    }
    table:not(.compact-table) {
      --metric-column-width: 9.5rem;
      --metric-columns-width: calc(var(--metric-column-width) * 2);
    }
    caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    thead th { block-size: 2.5rem; border-bottom: 1px solid var(--uui-color-border); font-weight: 700; }
    thead th:nth-child(n + 2) { color: var(--uui-color-text-alt); text-align: right; white-space: nowrap; width: var(--metric-column-width); }
    .subheading-row th { background: color-mix(in srgb, var(--uui-color-surface-alt) 35%, var(--uui-color-surface)); padding-block: 0; }
    th, td { box-sizing: border-box; padding: var(--uui-size-space-3) var(--uui-size-space-5); text-align: left; }
    tbody tr { height: 2.5rem; }
    tbody th, tbody td { padding-block: 0; }
    td { font-variant-numeric: tabular-nums; position: relative; text-align: right; z-index: 1; }
    tbody tr:hover, tbody tr:focus-within { position: relative; z-index: 2; }
    .metric-cell { align-items: center; display: flex; gap: var(--uui-size-space-2); justify-content: flex-end; }
    .metric-number { font-weight: 700; min-inline-size: 0; }
    .metric-share { color: color-mix(in srgb, var(--uui-color-text) 60%, transparent); font-weight: 700; margin-inline-end: var(--uui-size-space-3); }
    .filter-action { align-items: center; appearance: none; background: transparent; block-size: 1.75rem; border: 0; border-radius: var(--uui-border-radius); color: var(--uui-color-text-alt); cursor: pointer; display: inline-flex; font: inherit; inline-size: 1.75rem; justify-content: center; opacity: 0; padding: 0; }
    tbody tr:hover .filter-action, .filter-action:focus-visible, .filter-action[aria-pressed="true"] { opacity: 1; }
    .filter-action:hover { background: color-mix(in srgb, var(--uui-color-interactive) 10%, var(--uui-color-surface)); color: var(--uui-color-interactive-emphasis); }
    .filter-action[aria-pressed="true"] { background: color-mix(in srgb, var(--uui-color-interactive) 15%, var(--uui-color-surface)); color: var(--uui-color-interactive-emphasis); }
    .filter-action:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 1px; }
    tbody th { position: relative; font-weight: 500; min-width: 10rem; }
    .row-value { align-items: center; display: flex; gap: var(--uui-size-space-3); min-inline-size: 0; position: relative; z-index: 1; }
    .row-label { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-label a { align-items: center; color: inherit; display: flex; gap: var(--uui-size-space-1); min-inline-size: 0; text-decoration: none; }
    .link-label { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-label a:hover .link-label, .row-label a:focus-visible .link-label { text-decoration: underline; text-underline-offset: 0.12em; }
    .external-indicator { color: var(--uui-color-text-alt); flex: 0 0 auto; font-size: var(--uui-type-small-size); opacity: 0; transition: opacity 150ms ease-out; }
    .row-label a:hover .external-indicator, .row-label a:focus-visible .external-indicator { opacity: 1; }
    .country-flag { border-radius: var(--uui-border-radius); flex: 0 0 auto; object-fit: cover; }
    .referrer-favicon { border-radius: var(--uui-border-radius); flex: 0 0 auto; object-fit: contain; }
    .breakdown-value-icon { block-size: 1.25rem; flex: 0 0 auto; font-size: var(--uui-size-5); inline-size: 1.25rem; object-fit: contain; }
    .breakdown-value-icon-fallback { color: var(--uui-color-text-alt); }
    .percentage-value { display: inline-block; font-weight: 700; outline: none; position: relative; }
    .percentage-value:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    .percentage-tooltip {
      align-items: end;
      background: var(--uui-color-text);
      border-radius: var(--uui-border-radius);
      bottom: calc(100% + var(--uui-size-space-3));
      box-shadow: var(--uui-shadow-depth-2);
      color: var(--uui-color-surface);
      display: flex;
      flex-direction: column;
      font-size: 0.875rem;
      gap: var(--uui-size-space-1);
      opacity: 0;
      padding: var(--uui-size-space-3) var(--uui-size-space-4);
      pointer-events: none;
      position: absolute;
      right: calc(-1 * var(--uui-size-space-3));
      transform: translateY(var(--uui-size-space-2));
      transition: opacity 120ms ease-out, transform 120ms ease-out;
      visibility: hidden;
      white-space: nowrap;
      z-index: 3;
    }
    .percentage-tooltip::after {
      border: var(--uui-size-space-2) solid transparent;
      border-top-color: var(--uui-color-text);
      content: "";
      position: absolute;
      right: var(--uui-size-space-4);
      top: 100%;
    }
    .percentage-tooltip.below { bottom: auto; top: calc(100% + var(--uui-size-space-3)); transform: translateY(calc(-1 * var(--uui-size-space-2))); }
    .percentage-tooltip.below::after { border-bottom-color: var(--uui-color-text); border-top-color: transparent; bottom: 100%; top: auto; }
    .percentage-tooltip strong { font-size: var(--uui-type-default-size); }
    .percentage-tooltip span { color: color-mix(in srgb, var(--uui-color-surface) 70%, transparent); }
    .percentage-value:hover .percentage-tooltip,
    .percentage-value:focus .percentage-tooltip { opacity: 1; transform: translateY(0); visibility: visible; }
    a { color: var(--uui-color-interactive-emphasis); text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
    a:hover { text-decoration-thickness: 2px; }
    a:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    .bar {
      inset-block: 0.25rem;
      inset-inline-start: var(--bar-inset);
      inline-size: calc(100% + var(--metric-columns-width) - var(--bar-inset) - var(--bar-inset));
      position: absolute;
    }
    .bar::before {
      background: color-mix(in srgb, var(--uui-color-interactive) 4%, var(--uui-color-surface));
      border-radius: var(--uui-border-radius);
      block-size: 100%;
      content: "";
      display: block;
      inline-size: max(var(--bar-minimum), var(--bar-width));
    }
    .skeleton-line, .skeleton-number {
      background: var(--uui-color-surface-alt);
      block-size: 1lh;
      border-radius: var(--uui-border-radius);
      display: block;
    }
    .skeleton-line { width: 72%; }
    .skeleton-number { margin-inline-start: auto; width: 3.5rem; }
    .skeleton-table tbody tr:nth-child(3n + 2) .skeleton-line { width: 56%; }
    .skeleton-table tbody tr:nth-child(3n) .skeleton-line { width: 84%; }
    .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    .message-row td { color: var(--uui-color-text-alt); padding: var(--uui-size-space-5); text-align: left; }
    .message-row p { margin: 0; }
    @media (hover: none) { .filter-action { opacity: 1; } .external-indicator { opacity: 0.65; } }
    @media (prefers-reduced-motion: reduce) { .external-indicator, .percentage-tooltip { transition: none; } }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "web-analytics-breakdown-table": WebAnalyticsBreakdownTableElement;
  }
}
