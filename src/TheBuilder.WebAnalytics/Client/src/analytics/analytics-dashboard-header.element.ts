import { LitElement, css, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { UUISelectElement } from "@umbraco-cms/backoffice/external/uui";
import type { AnalyticsConnectionSummary, AnalyticsDocumentRoute } from "../api/types.gen.js";
import type { AnalyticsDateRange, DatePreset } from "./date-range.js";
import "./date-range-picker.element.js";

@customElement("vercel-analytics-dashboard-header")
export class VercelAnalyticsDashboardHeaderElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) connections: AnalyticsConnectionSummary[] = [];
  @property() connection?: string;
  @property({ attribute: false }) route?: AnalyticsDocumentRoute;
  @property({ attribute: false }) range!: AnalyticsDateRange;
  @property() preset: DatePreset = 30;
  @property() siteUrl?: string;
  @property({ type: Boolean }) documentScoped = false;

  #connection(): AnalyticsConnectionSummary | undefined {
    return this.connections.find(({ key }) => key === this.connection);
  }

  #hostname(): string | undefined {
    if (this.route?.hostname) return this.route.hostname;
    if (!this.siteUrl) return undefined;
    try { return new URL(this.siteUrl).hostname; } catch { return undefined; }
  }

  #selectOptions() {
    return this.connections.map(({ key, displayName }) => ({
      value: key,
      name: displayName,
      selected: key === this.connection,
    }));
  }

  #onConnectionChange(event: Event): void {
    this.dispatchEvent(new CustomEvent("connection-change", {
      bubbles: true,
      composed: true,
      detail: { connection: (event.target as UUISelectElement).value as string },
    }));
  }

  render() {
    const connection = this.#connection();
    const hostname = this.#hostname();
    const siteLabel = hostname ?? connection?.displayName;
    return html`
      <header>
        <div class="site-context">
          ${hostname && this.siteUrl ? html`
            <a class="site-link" href=${this.siteUrl} target="_blank" rel="noopener noreferrer">
              <uui-icon name="icon-globe" aria-hidden="true"></uui-icon>
              <span class="site-link-label">${hostname}</span>
              <uui-icon class="external-indicator" name="icon-out" aria-hidden="true"></uui-icon>
              <span class="visually-hidden">Open site in a new tab</span>
            </a>
          ` : siteLabel ? html`
            <span class="site-name"><uui-icon name="icon-globe" aria-hidden="true"></uui-icon><span>${siteLabel}</span></span>
          ` : ""}
        </div>
        <div class="controls">
          ${!this.documentScoped && this.connections.length > 1 ? html`
            <uui-select class="project-select" label="Vercel project" .options=${this.#selectOptions()} @change=${this.#onConnectionChange}></uui-select>
          ` : ""}
          <vercel-analytics-date-range-picker .preset=${this.preset} .range=${this.range}></vercel-analytics-date-range-picker>
        </div>
      </header>
      <div class="warnings">
        ${connection?.warnings.map((warning) => html`<uui-tag color="warning">${warning}</uui-tag>`)}
        ${this.route?.warnings.map((warning) => html`<uui-tag color="warning">${warning}</uui-tag>`)}
      </div>
    `;
  }

  static styles = [UmbTextStyles, css`
    header { align-items: center; display: flex; flex-wrap: wrap; gap: var(--uui-size-space-4); justify-content: space-between; margin-bottom: var(--uui-size-space-2); min-block-size: 2.5rem; }
    .site-context { align-items: center; display: flex; gap: var(--uui-size-space-3); min-block-size: 2.5rem; min-inline-size: 0; }
    .site-link, .site-name { align-items: center; color: var(--uui-color-text); display: inline-flex; font-weight: 700; gap: var(--uui-size-space-2); min-inline-size: 0; text-decoration: none; }
    .site-link:hover .site-link-label { text-decoration: underline; text-underline-offset: 0.18em; }
    .site-link:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 3px; }
    .site-context uui-icon, .external-indicator { color: var(--uui-color-text-alt); flex: 0 0 auto; }
    .external-indicator { font-size: 0.875em; }
    .controls { align-items: center; display: flex; flex-wrap: wrap; gap: var(--uui-size-space-3); justify-content: flex-end; margin-inline-start: auto; min-inline-size: 0; }
    .project-select {
      --uui-select-background-color: var(--uui-color-surface);
      --uui-select-border-color: color-mix(in srgb, var(--uui-color-border) 55%, var(--uui-color-text-alt));
      --uui-select-border-color-hover: var(--uui-color-interactive);
      --uui-select-font-size: inherit;
      --uui-select-height: 2.25rem;
      --uui-select-outline-color: var(--uui-color-selected);
      --uui-select-padding-x: var(--uui-size-space-3);
      --uui-select-padding-y: 0;
      font-weight: 600;
      min-inline-size: 11rem;
    }
    .project-select:hover { --uui-select-background-color: var(--uui-color-surface-alt); }
    .warnings { display: flex; flex-wrap: wrap; gap: var(--uui-size-space-3); margin-bottom: var(--uui-size-space-5); }
    .warnings:empty { display: none; }
    .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    @container (max-width: 62rem) { .project-select { inline-size: min(100%, 28rem); max-inline-size: 100%; } }
    @container (max-width: 32rem) {
      header { align-items: stretch; }
      .site-context { flex: 1 1 100%; }
      .controls { align-items: stretch; inline-size: 100%; margin-inline-start: 0; }
      .project-select, vercel-analytics-date-range-picker { box-sizing: border-box; flex: 1 1 100%; inline-size: 100%; max-inline-size: none; }
    }
  `];
}

declare global { interface HTMLElementTagNameMap { "vercel-analytics-dashboard-header": VercelAnalyticsDashboardHeaderElement; } }
