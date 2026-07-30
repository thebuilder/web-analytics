import { css, html, type TemplateResult } from "@umbraco-cms/backoffice/external/lit";

export function renderAnalyticsDrilldownFilter({
  label,
  removeLabel,
  remove,
}: {
  label: string;
  removeLabel: string;
  remove: () => void;
}): TemplateResult {
  return html`
    <button
      type="button"
      class="drilldown-filter"
      aria-label=${removeLabel}
      title=${removeLabel}
      @click=${remove}>
      <uui-icon name="icon-filter" aria-hidden="true"></uui-icon>
      <span class="drilldown-filter-label">${label}</span>
      <uui-icon class="drilldown-filter-remove" name="icon-delete" aria-hidden="true"></uui-icon>
    </button>
  `;
}

export const analyticsDrilldownFilterStyles = css`
  .drilldown-filter {
    align-items: center;
    appearance: none;
    background: color-mix(in srgb, var(--uui-color-interactive) 6%, var(--uui-color-surface));
    border: 1px solid color-mix(in srgb, var(--uui-color-interactive) 18%, var(--uui-color-border));
    border-radius: var(--uui-border-radius);
    color: var(--uui-color-interactive-emphasis);
    cursor: pointer;
    display: inline-flex;
    flex: 0 1 auto;
    font-size: var(--uui-type-small-size);
    font-weight: 400;
    gap: var(--uui-size-space-1);
    max-inline-size: 50%;
    min-inline-size: 0;
    padding: var(--uui-size-space-1) var(--uui-size-space-2);
    position: relative;
    z-index: 2;
  }
  .drilldown-filter:hover {
    background: color-mix(in srgb, var(--uui-color-interactive) 13%, var(--uui-color-surface));
    border-color: color-mix(in srgb, var(--uui-color-interactive) 34%, var(--uui-color-border));
  }
  .drilldown-filter:active {
    background: color-mix(in srgb, var(--uui-color-interactive) 18%, var(--uui-color-surface));
  }
  .drilldown-filter:focus-visible {
    outline: 2px solid var(--uui-color-selected);
    outline-offset: 1px;
  }
  .drilldown-filter-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .drilldown-filter-remove { flex: 0 0 auto; }
`;
