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
import { renderAnalyticsDialogHeadline } from "./analytics-dialog-headline.js";
import { analyticsDialogStyles } from "./analytics-dialog.styles.js";
import { breakdownDimensionLabel, type TrafficMetric } from "./breakdown-rows.js";
import { AUDIENCE_OPTIONS, breakdownDialogGroup, referrerDimensionOption, UTM_OPTIONS, type DimensionOption } from "./dashboard-cards.js";
import type { AnalyticsFilter, UtmDimension } from "./dashboard-url-state.js";
import { isUtmDimension } from "./utm-capability.js";
import type { ReportTabGroup } from "./report-tabs.js";
import "./breakdown-table.element.js";

@customElement("web-analytics-breakdown-dialog")
export class WebAnalyticsBreakdownDialogElement extends UmbElementMixin(LitElement) {
  @property() headline = "Breakdown";
  @property() loading = false;
  @property() unavailable?: string;
  @property() baseUrl?: string;
  @property() dimension?: AnalyticsDimension;
  @property() metric: TrafficMetric = "visitors";
  @property({ type: Boolean }) linkValues = false;
  @property({ attribute: false }) rows: AnalyticsBreakdownRow[] = [];
  @property({ attribute: false }) filters: AnalyticsFilter[] = [];
  @property({ attribute: false }) availableDimensions: AnalyticsDimension[] = [];
  @property() preferredUtmDimension: UtmDimension = "UtmSource";
  @state() private _search = "";
  @state() private _utmDimension?: UtmDimension;

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

  #selectDimension(option?: DimensionOption): void {
    if (!option || option.dimension === this.dimension) return;
    if (this.dimension && isUtmDimension(this.dimension)) this._utmDimension = this.dimension;
    if (isUtmDimension(option.dimension)) this._utmDimension = option.dimension;
    this._search = "";
    this.dispatchEvent(new CustomEvent("breakdown-dimension-change", {
      bubbles: true,
      composed: true,
      detail: { dimension: option.dimension, headline: option.headline },
    }));
  }

  #supports(dimension: AnalyticsDimension): boolean {
    return this.availableDimensions.length === 0 || this.availableDimensions.includes(dimension);
  }

  #audienceOptions(): ReadonlyArray<DimensionOption> {
    return AUDIENCE_OPTIONS.filter(({ dimension }) => this.#supports(dimension));
  }

  #utmOptions(): ReadonlyArray<DimensionOption<UtmDimension>> {
    return UTM_OPTIONS.filter(({ dimension }) => this.#supports(dimension));
  }

  #referrerOption(): DimensionOption | undefined {
    if (this.#supports("ReferrerHostname")) return referrerDimensionOption("ReferrerHostname");
    if (this.#supports("Referrer")) return referrerDimensionOption("Referrer");
    return undefined;
  }

  #selectedUtmOption(): DimensionOption<UtmDimension> | undefined {
    const options = this.#utmOptions();
    const selected = this._utmDimension
      ?? (this.dimension && isUtmDimension(this.dimension) ? this.dimension : this.preferredUtmDimension);
    return options.find(({ dimension }) => dimension === selected) ?? options[0];
  }

  #headingTabs(): ReportTabGroup | undefined {
    const group = breakdownDialogGroup(this.dimension);
    if (group === "audience") {
      const options = this.#audienceOptions();
      return {
        ariaLabel: "Audience technology",
        idPrefix: "expanded-audience-tab",
        options: options.map(({ dimension, label }) => ({ value: dimension, label })),
        selected: this.dimension ?? options[0]?.dimension ?? "DeviceType",
      };
    }
    if (group === "acquisition") {
      const referrer = this.#referrerOption();
      const utm = this.#selectedUtmOption();
      return {
        ariaLabel: "Traffic source",
        idPrefix: "expanded-acquisition-tab",
        options: [
          ...(referrer ? [{ value: "referrers", label: "Referrers" }] : []),
          ...(utm ? [{ value: "utm", label: "UTM" }] : []),
        ],
        selected: this.dimension && isUtmDimension(this.dimension) ? "utm" : "referrers",
      };
    }
    return undefined;
  }

  #subheadingTabs(): ReportTabGroup | undefined {
    if (breakdownDialogGroup(this.dimension) !== "acquisition" || !this.dimension || !isUtmDimension(this.dimension)) return undefined;
    return {
      appearance: "secondary",
      ariaLabel: "UTM parameter",
      idPrefix: "expanded-utm-tab",
      options: this.#utmOptions().map(({ dimension, label }) => ({ value: dimension, label })),
      selected: this.dimension,
    };
  }

  #selectHeading(value: string): void {
    const group = breakdownDialogGroup(this.dimension);
    if (group === "audience") {
      this.#selectDimension(this.#audienceOptions().find(({ dimension }) => dimension === value));
      return;
    }
    if (group === "acquisition") {
      this.#selectDimension(value === "referrers"
        ? this.#referrerOption()
        : this.#selectedUtmOption());
    }
  }

  #selectSubheading(value: string): void {
    if (breakdownDialogGroup(this.dimension) === "acquisition") this.#selectDimension(this.#utmOptions().find(({ dimension }) => dimension === value));
  }

  render() {
    const group = breakdownDialogGroup(this.dimension);
    const dialogHeadline = group === "audience" ? "Audience" : group === "acquisition" ? "Traffic sources" : this.headline;
    const headingTabs = this.#headingTabs();
    const subheadingTabs = this.#subheadingTabs();
    return html`
      <dialog aria-label=${dialogHeadline} @cancel=${this.#onCancel} @close=${this.#notifyClosed}>
        <div class="analytics-dialog-layout">
          ${renderAnalyticsDialogHeadline(dialogHeadline, `Close ${dialogHeadline}`, () => this.#close(), html`
            <uui-input
              type="search"
              label=${`Search ${this.headline}`}
              maxlength="200"
              placeholder="Search"
              .value=${this._search}
              @input=${this.#onSearch}>
              <uui-icon name="icon-search" slot="prepend"></uui-icon>
            </uui-input>
          `, false)}
          <div class="results analytics-dialog-body" aria-busy=${this.loading} aria-live="polite">
            <web-analytics-breakdown-table
              .headline=${this.headline}
              .rowLabel=${breakdownDimensionLabel(this.dimension)}
              .dimension=${this.dimension}
              .metric=${this.metric}
              .rows=${this.rows}
              .loading=${this.loading}
              .unavailable=${this.unavailable}
              .emptyMessage=${this._search ? "No matching results. Try a different search." : "No traffic was recorded for this breakdown."}
              .baseUrl=${this.baseUrl}
              .filters=${this.filters}
              .linkValues=${this.linkValues}
              .headingTabs=${headingTabs}
              .subheadingTabs=${subheadingTabs}
              @heading-tab-change=${(event: CustomEvent<{ value: string }>) => this.#selectHeading(event.detail.value)}
              @subheading-tab-change=${(event: CustomEvent<{ value: string }>) => this.#selectSubheading(event.detail.value)}></web-analytics-breakdown-table>
          </div>
        </div>
      </dialog>
    `;
  }

  static styles = [UmbTextStyles, analyticsDialogStyles, css`
    uui-input { box-sizing: border-box; width: 100%; }
    uui-input [slot="prepend"] { align-items: center; display: flex; margin-inline: var(--uui-size-space-3) var(--uui-size-space-2); }
    .results { overflow: auto; scrollbar-gutter: stable; }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "web-analytics-breakdown-dialog": WebAnalyticsBreakdownDialogElement;
  }
}
