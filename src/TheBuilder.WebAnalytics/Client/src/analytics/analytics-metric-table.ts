import { css, html, type TemplateResult } from "@umbraco-cms/backoffice/external/lit";
import { renderAnalyticsTableSkeletonRows } from "./analytics-table-skeleton.js";

export function renderAnalyticsMetricTable({
  caption,
  rowHeading,
  totalHeading,
  loading,
  skeletonRows,
  rows,
}: {
  caption: string;
  rowHeading: string;
  totalHeading: string;
  loading: boolean;
  skeletonRows: number;
  rows: TemplateResult | TemplateResult[];
}): TemplateResult {
  return html`
    ${loading ? html`<span class="visually-hidden" role="status">Loading ${caption.toLocaleLowerCase()}</span>` : ""}
    <table aria-busy=${loading ? "true" : "false"}>
      <caption>${caption}</caption>
      <thead><tr><th scope="col">${rowHeading}</th><th scope="col">Visitors</th><th scope="col">${totalHeading}</th></tr></thead>
      <tbody>${loading ? renderAnalyticsTableSkeletonRows(skeletonRows) : rows}</tbody>
    </table>
  `;
}

export const analyticsMetricTableStyles = css`
  :host { block-size: 100%; display: flex; flex-direction: column; overflow-x: auto; }
  table { --bar-inset: var(--uui-size-space-3); border-collapse: collapse; min-inline-size: 30rem; table-layout: fixed; width: 100%; }
  caption { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; width: 1px; }
  th, td { box-sizing: border-box; padding: var(--uui-size-space-3) var(--uui-size-space-5); text-align: left; }
  thead th { border-bottom: 1px solid var(--uui-color-border); font-weight: 700; }
  thead th:not(:first-child), td { text-align: right; width: 8rem; }
  tbody tr { height: 2.5rem; }
  tbody th, tbody td { padding-block: 0; }
  tbody th { font-weight: 500; min-width: 12rem; position: relative; }
  tbody td { font-variant-numeric: tabular-nums; position: relative; z-index: 1; }
  tbody tr:hover, tbody tr:focus-within { position: relative; z-index: 2; }
  .row-heading-content { align-items: center; display: flex; gap: var(--uui-size-space-2); min-inline-size: 0; position: relative; z-index: 1; }
  .row-action { appearance: none; background: transparent; border: 0; color: var(--uui-color-text); cursor: pointer; flex: 0 1 auto; font: inherit; min-inline-size: 0; overflow: hidden; padding: 0; position: relative; text-align: left; text-overflow: ellipsis; white-space: nowrap; z-index: 1; }
  .row-action:hover { text-decoration: underline; text-underline-offset: 0.18em; }
  .row-action:focus-visible, .empty a:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
  .row-value { display: block; flex: 0 1 auto; min-inline-size: 0; overflow: hidden; position: relative; text-overflow: ellipsis; white-space: nowrap; z-index: 1; }
  .bar { inset-block: var(--uui-size-space-1); inset-inline-start: var(--bar-inset); inline-size: calc(100% + 16rem - 2 * var(--bar-inset)); position: absolute; }
  .bar::before { background: color-mix(in srgb, var(--uui-color-interactive) 4%, var(--uui-color-surface)); block-size: 100%; border-radius: var(--uui-border-radius); content: ""; display: block; inline-size: max(var(--bar-minimum), var(--bar-width)); }
  .empty { align-items: center; display: flex; flex: 1; flex-direction: column; gap: var(--uui-size-space-3); justify-content: center; min-block-size: 16rem; padding: var(--uui-size-layout-1); text-align: center; }
  .empty-icon { align-items: center; border: 1px solid var(--uui-color-border); border-radius: 50%; color: var(--uui-color-text-alt); display: inline-flex; font-size: var(--uui-type-h4-size); height: 3rem; justify-content: center; width: 3rem; }
  .empty p { color: var(--uui-color-text-alt); margin: 0; max-width: 34rem; }
  .empty a { align-items: center; color: var(--uui-color-interactive-emphasis); display: inline-flex; gap: var(--uui-size-space-1); }
`;
