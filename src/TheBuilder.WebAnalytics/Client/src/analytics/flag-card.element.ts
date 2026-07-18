import { LitElement, css, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AnalyticsFlagRow, AnalyticsFlagsReport } from "../api/types.gen.js";
import { stateData, type AsyncState } from "./async-state.js";

const FLAGS_SETUP_URL = "https://vercel.com/docs/flags/observability/web-analytics";

@customElement("vercel-analytics-flag-card")
export class VercelAnalyticsFlagCardElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) report: AsyncState<AnalyticsFlagsReport> = { status: "loading" };
  @property({ attribute: false }) selected?: AsyncState<AnalyticsFlagsReport>;

  #select(value: string): void {
    this.dispatchEvent(new CustomEvent("select-flag", { bubbles: true, composed: true, detail: { flagKey: value } }));
  }

  #clear(): void {
    this.dispatchEvent(new CustomEvent("clear-selected-flag", { bubbles: true, composed: true }));
  }

  #rows(report: AnalyticsFlagsReport | undefined): AnalyticsFlagRow[] {
    return (report?.rows ?? []).filter(({ value }) => value !== "Others");
  }

  render() {
    const activeState = this.selected ?? this.report;
    const data = stateData(activeState);
    const rows = this.#rows(data);
    const loading = activeState.status === "idle" || activeState.status === "loading";
    const unavailable = activeState.status === "error" ? activeState.message : undefined;
    const selectedKey = data?.flagKey;
    const maximum = Math.max(...rows.map(({ pageViews }) => pageViews), 1);

    return html`
      <div class="header">
        <div class="title">
          ${selectedKey ? html`
            <button class="flag-back" type="button" aria-label=${`Show all flags instead of ${selectedKey}`} @click=${this.#clear}>
              <uui-icon name="icon-navigation-left" aria-hidden="true"></uui-icon><span class="selected-label">${selectedKey}</span>
            </button>
          ` : html`<strong>Flags</strong>`}
        </div>
        <span>Visitors</span><span>Total</span>
      </div>
      ${loading ? html`
        <div class="rows" aria-busy="true"><span class="visually-hidden" role="status">Loading feature flags</span>
          ${Array.from({ length: 3 }, () => html`<div class="row skeleton"><span></span><span></span><span></span></div>`)}
        </div>
      ` : unavailable ? html`
        <div class="empty error"><uui-icon name="icon-alert" aria-hidden="true"></uui-icon><strong>Flags could not be loaded</strong><p>${unavailable}</p></div>
      ` : rows.length === 0 ? html`
        <div class="empty">
          <span class="empty-icon"><uui-icon name="icon-flag" aria-hidden="true"></uui-icon></span>
          <strong>No flags</strong>
          <p>Track feature flags to understand how they affect visitor behaviour.</p>
          <a href=${FLAGS_SETUP_URL} target="_blank" rel="noopener noreferrer">Set up flag tracking <uui-icon name="icon-out" aria-hidden="true"></uui-icon></a>
        </div>
      ` : html`
        <div class="rows">
          ${rows.map((row) => html`
            <div class="row">
              <span class="bar" style=${`--bar-width:${(row.pageViews / maximum) * 100}%`}></span>
              ${selectedKey
                ? html`<strong class="value">${row.value}</strong>`
                : html`<button class="value select" type="button" @click=${() => this.#select(row.value)}>${row.value}</button>`}
              <strong>${this.localize.number(row.visitors)}</strong>
              <strong>${this.localize.number(row.pageViews)}</strong>
            </div>
          `)}
        </div>
      `}
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { block-size: 100%; display: flex; flex-direction: column; min-block-size: 22rem; }
    .header { align-items: center; block-size: 2.5rem; border-bottom: 1px solid var(--uui-color-border); box-sizing: border-box; display: grid; gap: var(--uui-size-space-4); grid-template-columns: minmax(0, 1fr) 8rem 8rem; padding-inline: var(--uui-size-space-5); }
    .header > span { font-weight: 700; text-align: right; }
    .title { align-items: center; display: flex; gap: var(--uui-size-space-2); min-width: 0; }
    .flag-back { align-items: center; appearance: none; background: transparent; block-size: 2rem; border: 0; color: var(--uui-color-text); cursor: pointer; display: inline-flex; font: inherit; font-weight: 700; gap: var(--uui-size-space-2); margin-inline-start: calc(-1 * var(--uui-size-space-2)); max-inline-size: 100%; min-inline-size: 0; padding: 0; }
    .flag-back uui-icon { flex: 0 0 auto; font-size: 1.25rem; }
    .flag-back:hover .selected-label { text-decoration: underline; text-underline-offset: .18em; }
    .selected-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .flag-back:focus-visible, .select:focus-visible, a:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    .rows { padding: 0; }
    .row { align-items: center; display: grid; gap: var(--uui-size-space-4); grid-template-columns: minmax(0, 1fr) 8rem 8rem; min-block-size: 3rem; padding: 0 var(--uui-size-space-5); position: relative; }
    .row > :not(.bar) { position: relative; z-index: 1; }
    .row > strong:not(.value) { font-variant-numeric: tabular-nums; text-align: right; }
    .bar { inset-block: var(--uui-size-space-1); inset-inline: var(--uui-size-space-3); position: absolute; }
    .bar::before { background: color-mix(in srgb, var(--uui-color-interactive) 4%, var(--uui-color-surface)); border-radius: var(--uui-border-radius); block-size: 100%; content: ""; display: block; inline-size: max(4px, var(--bar-width)); }
    .value { overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
    .select { appearance: none; background: transparent; border: 0; color: var(--uui-color-text); cursor: pointer; font: inherit; font-weight: 600; padding: 0; }
    .select:hover { text-decoration: underline; text-underline-offset: .18em; }
    .empty { align-items: center; display: flex; flex: 1; flex-direction: column; gap: var(--uui-size-space-3); justify-content: center; padding: var(--uui-size-layout-1); text-align: center; }
    .empty-icon { align-items: center; border: 1px solid var(--uui-color-border); border-radius: 50%; color: var(--uui-color-text-alt); display: inline-flex; font-size: 1.5rem; height: 3rem; justify-content: center; width: 3rem; }
    .empty p { color: var(--uui-color-text-alt); margin: 0; max-width: 34rem; }
    .empty a { align-items: center; color: var(--uui-color-interactive-emphasis); display: inline-flex; gap: var(--uui-size-space-1); }
    .error { color: var(--uui-color-danger); }
    .skeleton span { background: var(--uui-color-surface-alt); border-radius: var(--uui-border-radius); block-size: 1rem; }
    .skeleton span:first-child { inline-size: 55%; }
    .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    @media (max-width: 36rem) {
      .header, .row { grid-template-columns: minmax(0, 1fr) 5rem 5rem; }
      .header, .row { padding-inline: var(--uui-size-space-4); }
    }
  `];
}

declare global { interface HTMLElementTagNameMap { "vercel-analytics-flag-card": VercelAnalyticsFlagCardElement; } }
