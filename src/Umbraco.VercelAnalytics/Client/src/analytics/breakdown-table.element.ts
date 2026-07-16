import { LitElement, css, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import type { AnalyticsBreakdownRow } from "../api/types.gen.js";
import { analyticsRowHref, withoutAggregatedOthers } from "./breakdown-rows.js";

@customElement("vercel-analytics-breakdown-table")
export class VercelAnalyticsBreakdownTableElement extends UmbElementMixin(LitElement) {
  @property() headline = "Breakdown";
  @property() unavailable?: string;
  @property() baseUrl?: string;
  @property({ type: Boolean }) linkValues = false;
  @property({ attribute: false }) rows: AnalyticsBreakdownRow[] = [];

  render() {
    if (this.unavailable) return html`<p class="message">${this.unavailable}</p>`;
    const rows = withoutAggregatedOthers(this.rows);
    if (rows.length === 0) return html`<p class="message">No traffic was recorded for this breakdown.</p>`;
    const maximum = Math.max(...rows.map((row) => row.visitors), 1);

    return html`
      <table>
        <caption>${this.headline}</caption>
        <thead><tr><th scope="col">Value</th><th scope="col">Visitors</th><th scope="col">Page views</th></tr></thead>
        <tbody>${rows.map((row) => {
          const href = this.linkValues ? analyticsRowHref(this.baseUrl, row.value) : undefined;
          return html`
          <tr>
            <th scope="row">
              <span class="bar" style=${`--bar-width:${(row.visitors / maximum) * 100}%`}></span>
              <span>${href
                ? html`<a href=${href} target="_blank" rel="noopener noreferrer">${row.value || "Unknown"}<span class="visually-hidden"> (opens in a new tab)</span></a>`
                : row.value || "Unknown"}</span>
            </th>
            <td>${row.visitors.toLocaleString()}</td>
            <td>${row.pageViews.toLocaleString()}</td>
          </tr>
        `;})}</tbody>
      </table>
    `;
  }

  static styles = css`
    :host { display: block; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    th, td { border-bottom: 1px solid var(--uui-color-border); padding: var(--uui-size-space-3); text-align: left; }
    td { text-align: right; font-variant-numeric: tabular-nums; }
    tbody th { position: relative; font-weight: 500; min-width: 10rem; }
    tbody th span:last-child { position: relative; }
    a { color: var(--uui-color-interactive-emphasis); text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
    a:hover { text-decoration-thickness: 2px; }
    a:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    .bar {
      background: color-mix(in srgb, var(--uui-color-interactive) 16%, var(--uui-color-surface));
      border-inline-start: 3px solid var(--uui-color-interactive);
      border-radius: var(--uui-border-radius);
      inset: var(--uui-size-space-1) auto var(--uui-size-space-1) 0;
      position: absolute;
      width: var(--bar-width);
    }
    .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    .message { color: var(--uui-color-text-alt); }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-breakdown-table": VercelAnalyticsBreakdownTableElement;
  }
}
