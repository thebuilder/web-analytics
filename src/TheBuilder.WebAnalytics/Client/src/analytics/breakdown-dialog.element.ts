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
import type { AnalyticsBreakdownRow, AnalyticsDimension } from "../api/types.gen.js";
import { breakdownMetricTotal, type TrafficMetric } from "./breakdown-rows.js";
import type { AnalyticsFilter } from "./dashboard-url-state.js";
import "./breakdown-table.element.js";

@customElement("vercel-analytics-breakdown-dialog")
export class VercelAnalyticsBreakdownDialogElement extends UmbElementMixin(LitElement) {
  @property() headline = "Breakdown";
  @property() loading = false;
  @property() unavailable?: string;
  @property() baseUrl?: string;
  @property() dimension?: AnalyticsDimension;
  @property() metric: TrafficMetric = "visitors";
  @property({ type: Boolean }) linkValues = false;
  @property({ attribute: false }) rows: AnalyticsBreakdownRow[] = [];
  @property({ attribute: false }) filters: AnalyticsFilter[] = [];
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

  #onSearch(event: Event): void {
    this._search = String((event.target as UUIInputElement).value ?? "");
    this.dispatchEvent(new CustomEvent("search-breakdown", {
      bubbles: true,
      composed: true,
      detail: { search: this._search.trim() },
    }));
  }

  render() {
    return html`
      <dialog aria-label=${this.headline} @cancel=${this.#onCancel} @close=${this.#notifyClosed}>
        <uui-dialog-layout headline=${this.headline}>
          <uui-input
            type="search"
            label=${`Search ${this.headline}`}
            maxlength="200"
            placeholder="Search"
            .value=${this._search}
            @input=${this.#onSearch}>
            <uui-icon name="icon-search" slot="prepend"></uui-icon>
          </uui-input>
          <div class="results" aria-busy=${this.loading} aria-live="polite">
            ${!this.loading && this.unavailable ? html`<umb-empty-state headline="Results unavailable"><p>${this.unavailable}</p></umb-empty-state>` : ""}
            ${!this.loading && !this.unavailable && this._search && this.rows.length === 0
              ? html`<umb-empty-state headline="No matching results"><p>Try a different search.</p></umb-empty-state>`
              : ""}
            ${(this.loading || (!this.unavailable && (!this._search || this.rows.length > 0))) ? html`
              <vercel-analytics-breakdown-table
                .headline=${this.headline}
                .dimension=${this.dimension}
                .metric=${this.metric}
                .total=${breakdownMetricTotal(this.rows, this.metric)}
                .rows=${this.rows}
                .loading=${this.loading}
                .baseUrl=${this.baseUrl}
                .filters=${this.filters}
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
      max-width: min(50rem, calc(100vw - 2 * var(--uui-size-layout-1)));
      padding: 0;
      width: 100%;
    }
    dialog::backdrop { background: rgb(0 0 0 / 45%); }
    uui-dialog-layout {
      --uui-size-10: var(--uui-size-space-5);
      --uui-size-14: var(--uui-size-space-6);
    }
    uui-input { box-sizing: border-box; width: 100%; }
    uui-input [slot="prepend"] { align-items: center; display: flex; margin-inline: var(--uui-size-space-3) var(--uui-size-space-2); }
    .results { block-size: min(30rem, 52dvh); margin-top: var(--uui-size-space-4); overflow: auto; scrollbar-gutter: stable; }
    @media (max-width: 600px) {
      dialog { max-height: 100dvh; max-width: 100vw; }
      .results { block-size: 48dvh; }
    }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-breakdown-dialog": VercelAnalyticsBreakdownDialogElement;
  }
}
