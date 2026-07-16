import { LitElement, css, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import type { AnalyticsEventRow } from "../api/types.gen.js";
import { visibleEventRows } from "./event-rows.js";

@customElement("vercel-analytics-event-table")
export class VercelAnalyticsEventTableElement extends UmbElementMixin(LitElement) {
  @property({ type: Boolean }) loading = false;
  @property({ type: Number }) skeletonRows = 10;
  @property({ attribute: false }) rows: AnalyticsEventRow[] = [];

  #select(eventName: string): void {
    this.dispatchEvent(new CustomEvent("select-event", {
      bubbles: true,
      composed: true,
      detail: { eventName },
    }));
  }

  render() {
    const rows = visibleEventRows(this.rows);
    const maximum = Math.max(...rows.map((row) => row.count), 1);
    return html`
      ${this.loading ? html`<span class="visually-hidden" role="status">Loading events</span>` : ""}
      <table aria-busy=${this.loading ? "true" : "false"}>
        <caption>Custom events</caption>
        <thead><tr><th scope="col">Events</th><th scope="col">Visitors</th><th scope="col">Total events</th></tr></thead>
        <tbody>${this.loading
          ? Array.from({ length: this.skeletonRows }, () => html`
              <tr><th scope="row"><span class="skeleton-line"></span></th><td><span class="skeleton-number"></span></td><td><span class="skeleton-number"></span></td></tr>
            `)
          : rows.map((row) => html`
              <tr>
                <th scope="row">
                  <span class="bar" style=${`--bar-width:${(row.count / maximum) * 100}%;--bar-minimum:${row.count > 0 ? "4px" : "0px"}`}></span>
                  <button type="button" title=${`View details for ${row.eventName}`} @click=${() => this.#select(row.eventName)}>${row.eventName}</button>
                </th>
                <td>${row.visitors.toLocaleString()}</td>
                <td>${row.count.toLocaleString()}</td>
              </tr>
            `)}</tbody>
      </table>
    `;
  }

  static styles = css`
    :host { display: block; overflow-x: auto; }
    table { --bar-inset: var(--uui-size-space-3); border-collapse: collapse; min-inline-size: 30rem; table-layout: fixed; width: 100%; }
    caption { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; width: 1px; }
    th, td { box-sizing: border-box; padding: var(--uui-size-space-3) var(--uui-size-space-5); text-align: left; }
    thead th { border-bottom: 1px solid var(--uui-color-border); font-weight: 700; }
    thead th:not(:first-child), td { text-align: right; width: 8rem; }
    tbody th { font-weight: 500; min-width: 12rem; position: relative; }
    td { font-variant-numeric: tabular-nums; position: relative; z-index: 1; }
    button { appearance: none; background: transparent; border: 0; color: var(--uui-color-interactive-emphasis); cursor: pointer; font: inherit; max-width: 100%; overflow: hidden; padding: 0; position: relative; text-align: left; text-overflow: ellipsis; white-space: nowrap; z-index: 1; }
    button:hover { text-decoration: underline; text-underline-offset: 0.18em; }
    button:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    .bar { inset-block: var(--uui-size-space-1); inset-inline-start: var(--bar-inset); inline-size: calc(100% + 16rem - 2 * var(--bar-inset)); position: absolute; }
    .bar::before { background: color-mix(in srgb, var(--uui-color-interactive) 4%, var(--uui-color-surface)); block-size: 100%; border-radius: var(--uui-border-radius); content: ""; display: block; inline-size: max(var(--bar-minimum), var(--bar-width)); }
    .skeleton-line, .skeleton-number { background: var(--uui-color-surface-alt); block-size: 1lh; border-radius: var(--uui-border-radius); display: block; }
    .skeleton-line { width: 70%; }
    .skeleton-number { margin-inline-start: auto; width: 3.5rem; }
    .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-event-table": VercelAnalyticsEventTableElement;
  }
}
