import { LitElement, css, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AnalyticsSummary } from "../api/types.gen.js";
import { inclusiveRangeDays, type AnalyticsDateRange } from "./date-range.js";
import { availableSummaryMetrics, formatSummaryValue, summaryComparison, summaryMetricValue, type SummaryMetric } from "./summary-metrics.js";
import type { DashboardMetric } from "./dashboard-url-state.js";
import { isInitialLoading, stateData, type AsyncState } from "./async-state.js";
import { targetTabIndex } from "./tab-keyboard.js";
import "./history-chart.element.js";

@customElement("web-analytics-summary")
export class WebAnalyticsSummaryElement extends UmbElementMixin(LitElement) {
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
    const targetIndex = targetTabIndex(event, tabs);
    tabs[targetIndex]?.click();
    tabs[targetIndex]?.focus();
  }

  #metrics(): ReadonlyArray<SummaryMetric> {
    return availableSummaryMetrics(stateData(this.report)?.totals);
  }

  // A metric restored from the URL may not exist for this connection, so fall back to visitors.
  #selectedMetric(metrics: ReadonlyArray<SummaryMetric>): DashboardMetric {
    return metrics.some(({ metric }) => metric === this.metric) ? this.metric : "visitors";
  }

  #comparison(metric: DashboardMetric) {
    const report = stateData(this.report);
    return summaryComparison(
      metric,
      summaryMetricValue(report?.totals, metric) ?? 0,
      summaryMetricValue(report?.previousTotals ?? undefined, metric),
      inclusiveRangeDays(this.range),
    );
  }

  #renderComparison(metric: DashboardMetric) {
    const comparison = this.#comparison(metric);
    if (!comparison) return "";
    return html`
      <span class=${`comparison ${comparison.tone}`} title=${comparison.description}>
        <span aria-hidden="true">${comparison.display}</span>
        <span class="visually-hidden">${comparison.description}</span>
      </span>
    `;
  }

  #renderMetric({ metric, label }: SummaryMetric, selected: DashboardMetric) {
    const value = summaryMetricValue(stateData(this.report)?.totals, metric) ?? 0;
    return html`
      <button
        id=${`metric-${metric}-tab`}
        class="metric-tab"
        type="button"
        role="tab"
        aria-controls="history-panel"
        aria-selected=${selected === metric}
        tabindex=${selected === metric ? 0 : -1}
        @click=${() => this.#selectMetric(metric)}
        @keydown=${this.#onTabKeydown}>
        <span class="metric-label">${label}</span>
        ${isInitialLoading(this.report)
          ? html`<span class="metric-skeleton" aria-hidden="true"></span>`
          : html`<span class="metric-value">
              <strong>${formatSummaryValue(metric, value, (number, options) => this.localize.number(number, options))}</strong>
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
    const metrics = this.#metrics();
    const selected = this.#selectedMetric(metrics);
    return html`
      <uui-box class="history" aria-busy=${this.report.status === "loading" ? "true" : "false"}>
        <div class=${metrics.length > 2 ? "metric-tabs many" : "metric-tabs"} role="tablist" aria-label="Traffic metric">
          ${metrics.map((metric) => this.#renderMetric(metric, selected))}
        </div>
        <div
          id="history-panel"
          class="history-panel"
          role="tabpanel"
          aria-labelledby=${`metric-${selected}-tab`}>
          ${isInitialLoading(this.report) ? html`
            <span class="visually-hidden" role="status">Loading traffic summary and history</span>
            <div class="chart-skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          ` : stateData(this.report)?.points.length
              ? html`<web-analytics-history-chart .points=${stateData(this.report)!.points} .metric=${selected} .interval=${this.range.interval} .timeZone=${this.range.timeZone}></web-analytics-history-chart>`
              : html`<umb-empty-state headline="No history"><p>No traffic was recorded in this period.</p></umb-empty-state>`}
        </div>
      </uui-box>
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { display: block; inline-size: 100%; min-inline-size: 0; }
    .history, .summary-error { --uui-box-default-padding: 0; margin-bottom: var(--uui-size-layout-1); overflow: hidden; }
    .history { --web-analytics-chart-color: oklch(51.51% .2399 257.85); }
    .metric-tabs { background: var(--uui-color-surface); border-bottom: 1px solid var(--uui-color-border); display: flex; flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: thin; }
    .metric-tab { --metric-font-size: clamp(2rem, 3cqi, 3rem); appearance: none; background: transparent; border: 0; border-bottom: 3px solid transparent; box-sizing: border-box; color: var(--uui-color-text-alt); cursor: pointer; flex: 0 0 auto; font: inherit; inline-size: max-content; min-block-size: clamp(5.5rem, 8cqi, 6.5rem); min-inline-size: 18rem; padding: var(--uui-size-space-4) var(--uui-size-space-5); position: relative; text-align: left; transition: background-color 160ms ease-out, color 160ms ease-out; }
    /* Short dividers keep the strip open instead of boxing each metric in. */
    .metric-tab + .metric-tab::before { background: var(--uui-color-border); content: ""; inline-size: 1px; inset-block: var(--uui-size-space-4); inset-inline-start: 0; position: absolute; }
    .metric-tab[aria-selected="true"] { border-bottom-color: var(--web-analytics-chart-color); color: var(--uui-color-text); }
    .metric-tab[aria-selected="false"]:hover { background: color-mix(in srgb, var(--uui-color-interactive) 4%, var(--uui-color-surface)); color: var(--uui-color-text); }
    .metric-tab[aria-selected="false"]:active { background: color-mix(in srgb, var(--uui-color-interactive) 8%, var(--uui-color-surface)); }
    .metric-tab:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .metric-value { align-items: baseline; display: flex; flex-wrap: wrap; gap: var(--uui-size-space-2) var(--uui-size-space-4); margin-top: var(--uui-size-space-3); }
    .metric-tab strong { font-size: var(--metric-font-size); font-variant-numeric: tabular-nums; font-weight: 400; letter-spacing: -0.02em; line-height: 1.05; white-space: nowrap; }
    .metric-tabs.many .metric-tab { --metric-font-size: clamp(1.75rem, 2.4cqi, 2.5rem); flex: 1 1 0; inline-size: auto; max-inline-size: 18rem; min-inline-size: 10.5rem; }
    .metric-label { color: currentColor; font-weight: 700; white-space: nowrap; }
    .comparison { border-radius: var(--uui-border-radius); flex: 0 0 auto; font-size: var(--uui-type-small-size); font-weight: 700; line-height: var(--uui-type-default-line-height); padding: var(--uui-size-space-1) var(--uui-size-space-2); white-space: nowrap; }
    .comparison.positive { background: color-mix(in srgb, var(--uui-color-positive-standalone) 14%, var(--uui-color-surface)); color: var(--uui-color-positive-standalone); }
    .comparison.negative { background: color-mix(in srgb, var(--uui-color-danger-standalone) 14%, var(--uui-color-surface)); color: var(--uui-color-danger-standalone); }
    .comparison.neutral { background: var(--uui-color-surface-alt); color: var(--uui-color-text-alt); }
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
    @media (max-width: 48rem) {
      .metric-tab { --metric-font-size: clamp(1.5rem, 4cqi, 2rem); flex: 0 0 65cqi; min-block-size: 6.5rem; min-inline-size: 14rem; padding: var(--uui-size-space-4); }
      .metric-value { gap: var(--uui-size-space-2); }
    }
    @media (max-width: 40rem) {
      .metric-tab { --metric-font-size: clamp(1.25rem, 5cqi, 1.75rem); min-block-size: 5.5rem; padding: var(--uui-size-space-3); }
      .metric-label, .comparison { font-size: var(--uui-type-small-size); }
    }
    @media (prefers-reduced-motion: reduce) { .metric-tab { transition: none; } }
  `];
}

declare global { interface HTMLElementTagNameMap { "web-analytics-summary": WebAnalyticsSummaryElement; } }
