import { LitElement, css, customElement, html, property, state } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AnalyticsEventDetails, AnalyticsEventProperty } from "../api/types.gen.js";

@customElement("vercel-analytics-event-details-dialog")
export class VercelAnalyticsEventDetailsDialogElement extends UmbElementMixin(LitElement) {
  @property() eventName = "Event";
  @property({ type: Boolean }) loading = false;
  @property() unavailable?: string;
  @property({ attribute: false }) details?: AnalyticsEventDetails;
  @property() filterProperty?: string;
  @property() filterValue?: string;
  @state() private _propertyName?: string;

  protected firstUpdated(): void { this.shadowRoot?.querySelector("dialog")?.showModal(); }
  #close(): void { this.shadowRoot?.querySelector("dialog")?.close(); }
  #notifyClosed(): void { this.dispatchEvent(new CustomEvent("close-event-details", { bubbles: true, composed: true })); }
  #onCancel(event: Event): void { event.preventDefault(); this.#close(); }

  #activeProperty(): AnalyticsEventProperty | undefined {
    return this.details?.properties.find((property) => property.name === this._propertyName)
      ?? this.details?.properties[0];
  }

  #selectProperty(propertyName: string): void {
    this._propertyName = propertyName;
  }

  #onTabKeydown(event: KeyboardEvent): void {
    const properties = this.details?.properties ?? [];
    if (!properties.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const activeIndex = Math.max(0, properties.findIndex((property) => property.name === this.#activeProperty()?.name));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? properties.length - 1
        : (activeIndex + (event.key === "ArrowLeft" ? -1 : 1) + properties.length) % properties.length;
    this._propertyName = properties[nextIndex].name;
    this.updateComplete.then(() => this.shadowRoot
      ?.querySelector<HTMLButtonElement>(`[data-property-index="${nextIndex}"]`)
      ?.focus());
  }

  #toggleFilter(property: string, value: string): void {
    this.dispatchEvent(new CustomEvent("toggle-event-property-filter", {
      bubbles: true,
      composed: true,
      detail: { property, value },
    }));
  }

  #renderPropertyTabs(activeProperty: AnalyticsEventProperty) {
    return html`
      <div class="property-tabs" role="tablist" aria-label="Event properties">
        ${this.details?.properties.map((property, index) => html`
          <button
            id=${`event-property-${index}`}
            data-property-index=${index}
            type="button"
            role="tab"
            aria-controls="event-property-panel"
            aria-selected=${activeProperty.name === property.name}
            tabindex=${activeProperty.name === property.name ? 0 : -1}
            @click=${() => this.#selectProperty(property.name)}
            @keydown=${this.#onTabKeydown}>${property.name}</button>
        `)}
      </div>
    `;
  }

  #renderProperty(property: AnalyticsEventProperty) {
    const maximum = Math.max(...property.values.map((value) => value.count), 1);
    return html`
      <div id="event-property-panel" role="tabpanel" aria-labelledby=${`event-property-${this.details?.properties.indexOf(property) ?? 0}`}>
        <table>
          <caption>${property.name} values for ${this.eventName}</caption>
          <thead>
            <tr class="metric-headings">
              <th scope="col">${this.#renderPropertyTabs(property)}</th>
              <th scope="col">Visitors</th>
              <th scope="col">Total events</th>
            </tr>
            ${this.filterProperty !== undefined && this.filterValue !== undefined ? html`
              <tr class="active-filter-row"><th colspan="3">
                <button type="button" class="active-filter" @click=${() => this.#toggleFilter(this.filterProperty!, this.filterValue!)}>
                  <uui-icon name="icon-filter"></uui-icon>
                  <span>${this.filterProperty}: ${this.filterValue || "(empty)"}</span>
                  <uui-icon name="icon-delete"></uui-icon>
                </button>
              </th></tr>
            ` : ""}
          </thead>
          <tbody>${property.values.length ? property.values.map((value) => {
            const activeFilter = this.filterProperty === property.name && this.filterValue === value.value;
            return html`
              <tr>
                <th scope="row">
                  <span class="bar" style=${`--bar-width:${(value.count / maximum) * 100}%;--bar-minimum:${value.count > 0 ? "4px" : "0px"}`}></span>
                  <span class="value-label">${value.value || "(empty)"}</span>
                </th>
                <td>
                  <span class="visitors-content">
                    <button
                      type="button"
                      class="filter-button"
                      aria-pressed=${activeFilter}
                      aria-label=${activeFilter ? `Remove ${property.name} filter ${value.value || "empty"}` : `Filter by ${property.name} ${value.value || "empty"}`}
                      title=${activeFilter ? "Remove filter" : "Filter by this value"}
                      @click=${() => this.#toggleFilter(property.name, value.value)}>
                      <uui-icon name=${activeFilter ? "icon-delete" : "icon-filter"}></uui-icon>
                    </button>
                    <span>${value.visitors.toLocaleString()}</span>
                  </span>
                </td>
                <td>${value.count.toLocaleString()}</td>
              </tr>
            `;
          }) : html`<tr class="empty-row"><td colspan="3"><umb-empty-state headline="No values"><p>No values were recorded for this property in the selected period.</p></umb-empty-state></td></tr>`}</tbody>
        </table>
      </div>
    `;
  }

  render() {
    const activeProperty = this.#activeProperty();
    return html`
      <dialog aria-label=${`${this.eventName} event details`} @cancel=${this.#onCancel} @close=${this.#notifyClosed}>
        <uui-dialog-layout headline=${this.eventName}>
          <div class="dialog-content" aria-busy=${this.loading}>
            ${this.details ? html`
              ${activeProperty ? html`
                ${this.#renderProperty(activeProperty)}
              ` : html`<div class="state-message"><umb-empty-state headline="No event properties"><p>This event has totals, but no custom data properties were recorded in the selected period.</p></umb-empty-state></div>`}
              ${this.loading ? html`<div class="loading-overlay" role="status">Updating event details…</div>` : ""}
              ${this.unavailable ? html`<div class="error-overlay" role="alert">${this.unavailable}</div>` : ""}
            ` : this.loading ? html`<div class="loading" role="status">Loading event details…</div>` : this.unavailable ? html`<div class="state-message"><umb-empty-state headline="Event details unavailable"><p>${this.unavailable}</p></umb-empty-state></div>` : ""}
          </div>
          <uui-button slot="actions" look="secondary" label="Close event details" @click=${this.#close}>Close</uui-button>
        </uui-dialog-layout>
      </dialog>
    `;
  }

  static styles = [UmbTextStyles, css`
    dialog { border: 0; border-radius: var(--uui-border-radius); box-shadow: var(--uui-shadow-depth-5); box-sizing: border-box; margin: auto; max-height: min(52rem, calc(100dvh - 2 * var(--uui-size-layout-1))); max-width: min(52rem, calc(100vw - 2 * var(--uui-size-layout-1))); padding: 0; width: 100%; }
    dialog::backdrop { background: rgb(0 0 0 / 45%); }
    uui-dialog-layout { --uui-size-10: var(--uui-size-space-5); --uui-size-14: var(--uui-size-space-6); }
    .dialog-content { block-size: min(30rem, 52dvh); display: flex; flex-direction: column; min-block-size: 0; position: relative; }
    .property-tabs { display: flex; gap: var(--uui-size-space-1); overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: thin; }
    .property-tabs button { appearance: none; background: transparent; border: 0; border-bottom: 3px solid transparent; color: var(--uui-color-text-alt); cursor: pointer; flex: 0 0 auto; font: inherit; padding: var(--uui-size-space-3) var(--uui-size-space-4); }
    .property-tabs button:first-child { padding-inline-start: 0; }
    .property-tabs button:hover { color: var(--uui-color-text); }
    .property-tabs button[aria-selected="true"] { border-bottom-color: var(--uui-color-selected); color: var(--uui-color-text); font-weight: 700; }
    .property-tabs button:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -3px; }
    #event-property-panel { flex: 1; margin-inline: calc(-1 * var(--uui-size-space-5)); min-block-size: 0; overflow: auto; scrollbar-gutter: stable; }
    table { --bar-inset: var(--uui-size-space-3); border-collapse: separate; border-spacing: 0; min-inline-size: 34rem; table-layout: fixed; width: 100%; }
    caption { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; width: 1px; }
    th, td { box-sizing: border-box; padding: var(--uui-size-space-3) var(--uui-size-space-5); text-align: left; }
    thead { background: var(--uui-color-surface); box-shadow: 0 1px 0 var(--uui-color-border); position: sticky; top: 0; z-index: 3; }
    thead th { background: var(--uui-color-surface); font-weight: 700; }
    .metric-headings th:first-child { padding-block: 0; }
    .active-filter-row th { padding-block: var(--uui-size-space-2); }
    .active-filter { align-items: center; background: var(--uui-color-surface-alt); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); color: var(--uui-color-text); cursor: pointer; display: inline-flex; gap: var(--uui-size-space-2); max-inline-size: 100%; padding: var(--uui-size-space-2) var(--uui-size-space-3); }
    .active-filter span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .metric-headings th { box-shadow: 0 1px 0 var(--uui-color-border); }
    thead th:not(:first-child), td { text-align: right; width: 8rem; }
    tbody th { font-weight: 500; min-width: 12rem; position: relative; }
    td { font-variant-numeric: tabular-nums; position: relative; z-index: 1; }
    .visitors-content { display: inline-flex; position: relative; }
    .filter-button { align-items: center; background: transparent; border: 0; border-radius: var(--uui-border-radius); color: var(--uui-color-interactive); cursor: pointer; display: inline-flex; inset-block-start: 50%; inset-inline-end: calc(100% + var(--uui-size-space-2)); justify-content: center; min-block-size: 2rem; min-inline-size: 2rem; opacity: 0; position: absolute; transform: translateY(-50%); }
    tr:hover .filter-button, .filter-button:focus-visible, .filter-button[aria-pressed="true"] { opacity: 1; }
    .filter-button:hover { background: var(--uui-color-surface-emphasis); }
    .filter-button:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 1px; }
    .value-label { overflow-wrap: anywhere; position: relative; z-index: 1; }
    .bar { inset-block: var(--uui-size-space-1); inset-inline-start: var(--bar-inset); inline-size: calc(100% + 16rem - 2 * var(--bar-inset)); position: absolute; }
    .bar::before { background: color-mix(in srgb, var(--uui-color-interactive) 4%, var(--uui-color-surface)); block-size: 100%; border-radius: var(--uui-border-radius); content: ""; display: block; inline-size: max(var(--bar-minimum), var(--bar-width)); }
    .loading, .state-message { box-sizing: border-box; flex: 1; padding: var(--uui-size-space-5); }
    .loading-overlay { background: color-mix(in srgb, var(--uui-color-surface) 82%, transparent); inset: 0; padding: var(--uui-size-space-5); position: absolute; z-index: 4; }
    .error-overlay { background: color-mix(in srgb, var(--uui-color-warning) 8%, var(--uui-color-surface)); border: 1px solid color-mix(in srgb, var(--uui-color-warning) 28%, var(--uui-color-border)); border-radius: var(--uui-border-radius); inset-block-start: var(--uui-size-space-3); inset-inline: var(--uui-size-space-3); padding: var(--uui-size-space-4); position: absolute; z-index: 5; }
    .empty-row td { padding: var(--uui-size-space-5); text-align: left; }
    .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    @media (max-width: 600px) {
      dialog { max-height: 100dvh; max-width: 100vw; }
      .dialog-content { block-size: 48dvh; }
    }
    @media (hover: none) { .filter-button { opacity: 1; } }
  `];
}

declare global { interface HTMLElementTagNameMap { "vercel-analytics-event-details-dialog": VercelAnalyticsEventDetailsDialogElement; } }
