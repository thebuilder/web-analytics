import { LitElement, css, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AnalyticsSummary } from "../api/types.gen.js";
import { inclusiveRangeDays, type AnalyticsDateRange } from "./date-range.js";
import { metricComparison } from "./metric-comparison.js";
import type { DashboardMetric } from "./dashboard-url-state.js";
import { stateData, type AsyncState } from "./async-state.js";
import "./history-chart.element.js";

@customElement("vercel-analytics-summary")
export class VercelAnalyticsSummaryElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) report: AsyncState<AnalyticsSummary> = { status: "loading" };
  @property({ attribute: false }) range!: AnalyticsDateRange;
  @property() metric: DashboardMetric = "visitors";

  #selectMetric(metric: DashboardMetric): void {
    this.dispatchEvent(new CustomEvent("metric-change", {
      bubbles: true,
      composed: true,
      detail: { metric },
    }));
  }

  #retry(): void {
    this.dispatchEvent(new CustomEvent("retry-summary", { bubbles: true, composed: true }));
  }

  #onTabKeydown(event: KeyboardEvent): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(this.shadowRoot?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? []);
    const currentIndex = tabs.indexOf(event.currentTarget as HTMLButtonElement);
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
    tabs[targetIndex]?.click();
    tabs[targetIndex]?.focus();
  }

  #comparison(metric: DashboardMetric) {
    const label = metric === "visitors" ? "visitors" : "page views";
    return metricComparison(
      stateData(this.report)?.totals[metric] ?? 0,
      stateData(this.report)?.previousTotals?.[metric],
      label,
      inclusiveRangeDays(this.range),
    );
  }

  #renderComparison(metric: DashboardMetric) {
    const comparison = this.#comparison(metric);
    if (!comparison) return "";
    return html`
      <span class=${`comparison ${comparison.direction}`} title=${comparison.description}>
        <span aria-hidden="true">${comparison.display}</span>
        <span class="visually-hidden">${comparison.description}</span>
      </span>
    `;
  }

  #renderMetric(metric: DashboardMetric, label: string) {
    return html`
      <button
        id=${`metric-${metric}-tab`}
        class="metric-tab"
        type="button"
        role="tab"
        aria-controls="history-panel"
        aria-selected=${this.metric === metric}
        tabindex=${this.metric === metric ? 0 : -1}
        @click=${() => this.#selectMetric(metric)}
        @keydown=${this.#onTabKeydown}>
        <span class="eyebrow">${label}</span>
        ${this.report.status === "loading"
          ? html`<span class="metric-skeleton" aria-hidden="true"></span>`
          : html`<span class="metric-value">
              <strong>${this.localize.number(stateData(this.report)?.totals[metric] ?? 0)}</strong>
              ${this.#renderComparison(metric)}
            </span>`}
      </button>
    `;
  }

  render() {
    if (this.report.status === "error" && !this.report.previous) return html`
      <uui-box class="summary-error">
        <div class="summary-error-content" role="status">
          <uui-icon name="icon-alert" aria-hidden="true"></uui-icon>
          <div class="summary-error-copy">
            <strong>Analytics unavailable</strong>
            <p>${this.report.message}</p>
          </div>
          <uui-button look="secondary" label="Retry analytics summary" @click=${this.#retry}>Retry</uui-button>
        </div>
      </uui-box>
    `;
    return html`
      <uui-box class="history" aria-busy=${this.report.status === "loading" ? "true" : "false"}>
        <div class="metric-tabs" role="tablist" aria-label="Traffic metric">
          ${this.#renderMetric("visitors", "Visitors")}
          ${this.#renderMetric("pageViews", "Page views")}
        </div>
        <div
          id="history-panel"
          class="history-panel"
          role="tabpanel"
          aria-labelledby=${`metric-${this.metric}-tab`}>
          ${this.report.status === "loading" ? html`
            <span class="visually-hidden" role="status">Loading traffic summary and history</span>
            <div class="chart-skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          ` : stateData(this.report)?.points.length
              ? html`<vercel-analytics-history-chart .points=${stateData(this.report)!.points} .metric=${this.metric} .interval=${this.range.interval} .timeZone=${this.range.timeZone}></vercel-analytics-history-chart>`
              : html`<umb-empty-state headline="No history"><p>No traffic was recorded in this period.</p></umb-empty-state>`}
        </div>
      </uui-box>
    `;
  }

  static styles = [UmbTextStyles, css`
    .history, .summary-error { --uui-box-default-padding: 0; margin-bottom: var(--uui-size-layout-1); overflow: hidden; }
    .history { --vercel-analytics-chart-color: oklch(51.51% .2399 257.85); }
    .metric-tabs { background: var(--uui-color-surface-alt); border-bottom: 1px solid var(--uui-color-border); display: flex; flex-wrap: nowrap; }
    .metric-tab { --metric-font-size: clamp(2rem, 3cqi, 3rem); appearance: none; background: transparent; border: 0; border-bottom: 3px solid transparent; color: var(--uui-color-text-alt); cursor: pointer; flex: 0 0 auto; font: inherit; inline-size: max-content; min-block-size: 7.75rem; min-inline-size: 18rem; padding: var(--uui-size-space-5); text-align: left; transition: background-color 160ms ease-out, color 160ms ease-out; }
    .metric-tab:last-child { border-inline-end: 1px solid var(--uui-color-border); }
    .metric-tab[aria-selected="true"] { background: var(--uui-color-surface); border-bottom-color: var(--vercel-analytics-chart-color); color: var(--uui-color-text); }
    .metric-tab[aria-selected="false"]:hover { background: color-mix(in srgb, var(--uui-color-interactive) 7%, var(--uui-color-surface)); }
    .metric-tab[aria-selected="false"]:active { background: color-mix(in srgb, var(--uui-color-interactive) 11%, var(--uui-color-surface)); }
    .metric-tab:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .metric-value { align-items: center; display: flex; flex-wrap: nowrap; gap: var(--uui-size-space-4); margin-top: var(--uui-size-space-3); }
    .metric-tab strong { font-size: var(--metric-font-size); font-variant-numeric: tabular-nums; line-height: 1.1; white-space: nowrap; }
    .eyebrow { color: currentColor; font-weight: 700; }
    .comparison { border-radius: var(--uui-border-radius); flex: 0 0 auto; font-weight: 700; padding: var(--uui-size-space-2) var(--uui-size-space-3); white-space: nowrap; }
    .comparison.increase { background: color-mix(in srgb, var(--uui-color-positive-standalone) 14%, var(--uui-color-surface)); color: var(--uui-color-positive-standalone); }
    .comparison.decrease { background: color-mix(in srgb, var(--uui-color-danger-standalone) 14%, var(--uui-color-surface)); color: var(--uui-color-danger-standalone); }
    .comparison.unchanged { background: var(--uui-color-surface-alt); color: var(--uui-color-text-alt); }
    .metric-skeleton { background: var(--uui-color-surface-alt); block-size: 1.1em; border-radius: var(--uui-border-radius); display: block; font-size: var(--metric-font-size); inline-size: 58%; margin-top: var(--uui-size-space-3); max-inline-size: 14rem; }
    .history-panel { padding: var(--uui-size-space-3); }
    .chart-skeleton { block-size: 18rem; display: grid; }
    .chart-skeleton span { border-top: 1px solid var(--uui-color-border); }
    .summary-error { --uui-box-border-width: 1px; --uui-box-border-color: color-mix(in srgb, var(--uui-color-warning-standalone) 35%, var(--uui-color-border)); --uui-box-box-shadow: none; }
    .summary-error-content { align-items: center; background: color-mix(in srgb, var(--uui-color-warning) 8%, var(--uui-color-surface)); display: flex; flex-wrap: wrap; gap: var(--uui-size-space-5); padding: var(--uui-size-space-5); }
    .summary-error-content uui-icon { color: var(--uui-color-warning-standalone); font-size: 1.5rem; }
    .summary-error-copy { flex: 1 1 22rem; }
    .summary-error-copy p { color: var(--uui-color-text-alt); margin: var(--uui-size-space-1) 0 0; }
    .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    @container (max-width: 48rem) {
      .metric-tab { --metric-font-size: clamp(1.5rem, 4cqi, 2rem); flex: 1 1 50%; min-block-size: 6.5rem; min-inline-size: 0; padding: var(--uui-size-space-4); }
      .metric-value { gap: var(--uui-size-space-2); }
      .comparison { font-size: 0.875rem; padding: var(--uui-size-space-1) var(--uui-size-space-2); }
    }
    @container (max-width: 40rem) {
      .metric-tab { --metric-font-size: clamp(1.25rem, 5cqi, 1.75rem); box-sizing: border-box; min-block-size: 5.5rem; padding: var(--uui-size-space-3); }
      .eyebrow { font-size: 0.875rem; }
      .comparison { font-size: 0.75rem; }
    }
    @media (prefers-reduced-motion: reduce) { .metric-tab { transition: none; } }
  `];
}

declare global { interface HTMLElementTagNameMap { "vercel-analytics-summary": VercelAnalyticsSummaryElement; } }
