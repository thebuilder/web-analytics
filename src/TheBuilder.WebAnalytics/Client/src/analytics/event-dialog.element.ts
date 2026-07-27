import { LitElement, css, customElement, html, property, state } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AnalyticsEventRow } from "../api/types.gen.js";
import { renderAnalyticsDialogHeadline } from "./analytics-dialog-headline.js";
import { analyticsDialogStyles, analyticsEventDialogStyles } from "./analytics-dialog.styles.js";
import type { AnalyticsFilter } from "./dashboard-url-state.js";
import { cancelDialog, closeDialog, notifyDialogClosed, notifyDialogSearch, openDialog, searchInputValue } from "./dialog-lifecycle.js";
import "./event-table.element.js";

@customElement("web-analytics-event-dialog")
export class WebAnalyticsEventDialogElement extends UmbElementMixin(LitElement) {
  @property({ type: Boolean }) loading = false;
  @property() unavailable?: string;
  @property({ attribute: false }) rows: AnalyticsEventRow[] = [];
  @property({ attribute: false }) filters: AnalyticsFilter[] = [];
  @property({ type: Boolean }) detailsEnabled = true;
  @property({ type: Boolean }) filteringEnabled = false;
  @state() private _search = "";

  protected firstUpdated(): void { openDialog(this); }
  #close(): void { closeDialog(this); }
  #notifyClosed(): void { notifyDialogClosed(this, "close-events"); }
  #onCancel(event: Event): void { cancelDialog(event, this); }
  #onSearch(event: Event): void {
    this._search = searchInputValue(event);
    notifyDialogSearch(this, "search-events", this._search);
  }

  render() {
    return html`
      <dialog aria-label="Events" @cancel=${this.#onCancel} @close=${this.#notifyClosed}>
        <div class="analytics-dialog-layout">
          ${renderAnalyticsDialogHeadline("Events", "Close events", () => this.#close(), html`
            <uui-input type="search" label="Search events" maxlength="200" placeholder="Search" .value=${this._search} @input=${this.#onSearch}>
              <uui-icon name="icon-search" slot="prepend"></uui-icon>
            </uui-input>
          `, false)}
          <div class="results analytics-dialog-body" aria-busy=${this.loading} aria-live="polite">
            ${!this.loading && this.unavailable ? html`<umb-empty-state headline="Events unavailable"><p>${this.unavailable}</p></umb-empty-state>` : ""}
            ${!this.loading && !this.unavailable && this._search && this.rows.length === 0 ? html`<umb-empty-state headline="No matching events"><p>Try a different search.</p></umb-empty-state>` : ""}
            ${this.loading || (!this.unavailable && (!this._search || this.rows.length > 0)) ? html`
              <web-analytics-event-table .rows=${this.rows} .filters=${this.filters} .loading=${this.loading} .detailsEnabled=${this.detailsEnabled} .filteringEnabled=${this.filteringEnabled}></web-analytics-event-table>
            ` : ""}
          </div>
        </div>
      </dialog>
    `;
  }

  static styles = [UmbTextStyles, analyticsDialogStyles, analyticsEventDialogStyles, css`
    uui-input { box-sizing: border-box; width: 100%; }
    uui-input [slot="prepend"] { align-items: center; display: flex; margin-inline: var(--uui-size-space-3) var(--uui-size-space-2); }
    .results { overflow: auto; scrollbar-gutter: stable; }
  `];
}

declare global { interface HTMLElementTagNameMap { "web-analytics-event-dialog": WebAnalyticsEventDialogElement; } }
