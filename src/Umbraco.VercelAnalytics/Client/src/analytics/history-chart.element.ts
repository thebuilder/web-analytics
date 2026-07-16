import {
  LitElement,
  css,
  customElement,
  html,
  property,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import {
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import type { AnalyticsPoint } from "../api/types.gen.js";
import type { AnalyticsInterval } from "../api/types.gen.js";
import { formatAnalyticsDate } from "./date-range.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

@customElement("vercel-analytics-history-chart")
export class VercelAnalyticsHistoryChartElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) points: AnalyticsPoint[] = [];
  @property() metric: "visitors" | "pageViews" = "visitors";
  @property() interval: AnalyticsInterval = "Day";
  @state() private _showTable = false;
  #chart?: Chart;

  protected updated(): void {
    this.#renderChart();
  }

  disconnectedCallback(): void {
    this.#chart?.destroy();
    super.disconnectedCallback();
  }

  #renderChart(): void {
    const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) return;
    this.#chart?.destroy();

    const style = getComputedStyle(this);
    const color = style.getPropertyValue("--uui-color-interactive").trim() || "#3544b1";
    this.#chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: this.points.map((point) => formatAnalyticsDate(point.timestamp, this.interval)),
        datasets: [{
          data: this.points.map((point) => point[this.metric]),
          borderColor: color,
          backgroundColor: `${color}1f`,
          fill: true,
          pointRadius: 2,
          tension: 0.2,
        }],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        plugins: { tooltip: { enabled: true } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  render() {
    const label = this.metric === "visitors" ? "Visitors" : "Page views";
    return html`
      <div class="chart" role="img" aria-label="${label} history for ${this.points.length} periods">
        <canvas aria-hidden="true"></canvas>
      </div>
      <uui-button
        look="secondary"
        label=${this._showTable ? "Hide history data table" : "View history data table"}
        @click=${() => (this._showTable = !this._showTable)}>
        ${this._showTable ? "Hide data table" : "View data table"}
      </uui-button>
      ${this._showTable ? html`
        <table>
          <caption>${label} history</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">${label}</th></tr></thead>
          <tbody>${this.points.map((point) => html`
            <tr><td>${formatAnalyticsDate(point.timestamp, this.interval)}</td><td>${point[this.metric].toLocaleString()}</td></tr>
          `)}</tbody>
        </table>
      ` : ""}
    `;
  }

  static styles = css`
    :host { display: block; }
    .chart { height: 18rem; margin-bottom: var(--uui-size-space-4); }
    canvas { width: 100%; height: 100%; }
    table { border-collapse: collapse; width: 100%; margin-top: var(--uui-size-space-4); }
    th, td { border-bottom: 1px solid var(--uui-color-border); padding: var(--uui-size-space-3); text-align: left; }
    th:last-child, td:last-child { text-align: right; }
    caption { text-align: left; font-weight: 700; margin-bottom: var(--uui-size-space-3); }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-history-chart": VercelAnalyticsHistoryChartElement;
  }
}
