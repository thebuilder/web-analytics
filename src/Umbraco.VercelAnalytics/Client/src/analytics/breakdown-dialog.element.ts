import {
  LitElement,
  css,
  customElement,
  html,
  property,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { UUIInputElement } from "@umbraco-cms/backoffice/external/uui";
import type { AnalyticsBreakdownRow } from "../api/types.gen.js";
import { filterBreakdownRows } from "./breakdown-rows.js";
import "./breakdown-table.element.js";

@customElement("vercel-analytics-breakdown-dialog")
export class VercelAnalyticsBreakdownDialogElement extends UmbElementMixin(LitElement) {
  @property() headline = "Breakdown";
  @property() loading = false;
  @property() unavailable?: string;
  @property() baseUrl?: string;
  @property({ type: Boolean }) linkValues = false;
  @property({ attribute: false }) rows: AnalyticsBreakdownRow[] = [];
  @state() private _search = "";

  protected firstUpdated(): void {
    this.shadowRoot?.querySelector("dialog")?.showModal();
  }

  #close(): void {
    this.shadowRoot?.querySelector("dialog")?.close();
  }

  #notifyClosed(): void {
    this.dispatchEvent(new CustomEvent("close-breakdown", { bubbles: true, composed: true }));
  }

  #onCancel(event: Event): void {
    event.preventDefault();
    this.#close();
  }

  render() {
    const rows = filterBreakdownRows(this.rows, this._search);
    return html`
      <dialog aria-label=${this.headline} @cancel=${this.#onCancel} @close=${this.#notifyClosed}>
        <uui-dialog-layout headline=${this.headline}>
          <uui-input
            type="search"
            label=${`Search ${this.headline}`}
            placeholder="Search"
            .value=${this._search}
            @input=${(event: Event) => (this._search = String((event.target as UUIInputElement).value ?? ""))}>
            <uui-icon name="icon-search" slot="prepend"></uui-icon>
          </uui-input>
          <div class="results" aria-live="polite">
            ${this.loading ? html`<uui-loader-bar aria-label=${`Loading all ${this.headline}`}></uui-loader-bar>` : ""}
            ${!this.loading && this.unavailable ? html`<umb-empty-state headline="Results unavailable"><p>${this.unavailable}</p></umb-empty-state>` : ""}
            ${!this.loading && !this.unavailable && this._search && rows.length === 0
              ? html`<umb-empty-state headline="No matching results"><p>Try a different search.</p></umb-empty-state>`
              : ""}
            ${!this.loading && !this.unavailable && (!this._search || rows.length > 0) ? html`
              <vercel-analytics-breakdown-table
                .headline=${this.headline}
                .rows=${rows}
                .baseUrl=${this.baseUrl}
                .linkValues=${this.linkValues}></vercel-analytics-breakdown-table>
            ` : ""}
          </div>
          <uui-button slot="actions" look="secondary" label="Close breakdown" @click=${this.#close}>Close</uui-button>
        </uui-dialog-layout>
      </dialog>
    `;
  }

  static styles = [UmbTextStyles, css`
    dialog {
      border: 0;
      border-radius: var(--uui-border-radius);
      box-shadow: var(--uui-shadow-depth-5);
      box-sizing: border-box;
      margin: auto;
      max-height: min(52rem, calc(100dvh - 2 * var(--uui-size-layout-1)));
      max-width: min(58rem, calc(100vw - 2 * var(--uui-size-layout-1)));
      padding: 0;
      width: 100%;
    }
    dialog::backdrop { background: rgb(0 0 0 / 45%); }
    uui-dialog-layout { min-height: 22rem; }
    uui-input { box-sizing: border-box; width: 100%; }
    .results { margin-top: var(--uui-size-space-5); max-height: min(36rem, 60dvh); overflow: auto; }
    @media (max-width: 600px) {
      dialog { max-height: 100dvh; max-width: 100vw; }
      .results { max-height: 64dvh; }
    }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-breakdown-dialog": VercelAnalyticsBreakdownDialogElement;
  }
}
