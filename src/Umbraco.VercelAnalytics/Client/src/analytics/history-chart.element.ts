import {
  LitElement,
  css,
  customElement,
  html,
  property,
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
import type { Plugin } from "chart.js";
import type { AnalyticsInterval } from "../api/types.gen.js";
import { formatChartAxisValue } from "./chart-value.js";
import { formatAnalyticsDate, formatAnalyticsTooltipDate, isAnalyticsPeriodInProgress } from "./date-range.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

@customElement("vercel-analytics-history-chart")
export class VercelAnalyticsHistoryChartElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) points: Array<{ timestamp: string; visitors: number; pageViews?: number; count?: number }> = [];
  @property() metric: "visitors" | "pageViews" | "count" = "visitors";
  @property() interval: AnalyticsInterval = "Day";
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
    const fillColor = style.getPropertyValue("--vercel-analytics-chart-fill").trim() || "rgba(0, 112, 243, 0.14)";
    const guideColor = style.getPropertyValue("--uui-color-text").trim() || "#1b264f";
    const surfaceColor = style.getPropertyValue("--uui-color-surface").trim() || "#ffffff";
    const borderColor = style.getPropertyValue("--uui-color-border").trim() || "#d8d7d9";
    const label = this.#metricLabel();
    const latestPoint = this.points[this.points.length - 1];
    const latestPeriodInProgress = latestPoint
      ? isAnalyticsPeriodInProgress(latestPoint.timestamp, this.interval)
      : false;
    const hoverGuide: Plugin<"line"> = {
      id: "vercelAnalyticsHoverGuide",
      afterDatasetsDraw: (chart) => {
        const activeElement = chart.tooltip?.getActiveElements()[0];
        if (!activeElement) return;

        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(activeElement.element.x, chartArea.top);
        ctx.lineTo(activeElement.element.x, chartArea.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = guideColor;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(activeElement.element.x, activeElement.element.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      },
    };
    this.#chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: this.points.map((point) => formatAnalyticsDate(point.timestamp, this.interval)),
        datasets: [{
          label,
          data: this.points.map((point) => point[this.metric] ?? 0),
          borderColor: color,
          backgroundColor: fillColor,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
          segment: {
            borderDash: (context) => latestPeriodInProgress && context.p1DataIndex === this.points.length - 1
              ? [6, 6]
              : undefined,
          },
        }],
      },
      options: {
        animation: false,
        interaction: {
          axis: "x",
          intersect: false,
          mode: "index",
        },
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            backgroundColor: surfaceColor,
            bodyColor: guideColor,
            borderColor,
            borderWidth: 1,
            callbacks: {
              label: (context) => `${label}  ${context.formattedValue}`,
              title: (items) => {
                const point = this.points[items[0]?.dataIndex ?? -1];
                return point ? formatAnalyticsTooltipDate(point.timestamp, this.interval) : "";
              },
            },
            cornerRadius: 8,
            padding: 12,
            titleColor: guideColor,
            enabled: true,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { autoSkip: true, maxTicksLimit: 7, maxRotation: 0 },
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatChartAxisValue(Number(value)),
              maxTicksLimit: 5,
            },
          },
        },
      },
      plugins: [hoverGuide],
    });
  }

  render() {
    const label = this.#metricLabel();
    const latestPoint = this.points[this.points.length - 1];
    const latestPeriodInProgress = latestPoint
      ? isAnalyticsPeriodInProgress(latestPoint.timestamp, this.interval)
      : false;
    const progressDescription = latestPeriodInProgress ? ". The final period is still in progress" : "";
    return html`
      <div class="chart" role="img" aria-label="${label} history for ${this.points.length} periods${progressDescription}">
        <canvas aria-hidden="true"></canvas>
      </div>
    `;
  }

  #metricLabel(): string {
    if (this.metric === "visitors") return "Visitors";
    return this.metric === "pageViews" ? "Page views" : "Total events";
  }

  static styles = css`
    :host { display: block; }
    .chart { height: 18rem; }
    canvas { width: 100%; height: 100%; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-history-chart": VercelAnalyticsHistoryChartElement;
  }
}
