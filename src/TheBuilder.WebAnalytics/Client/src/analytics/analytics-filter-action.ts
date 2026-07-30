import { css, html } from "@umbraco-cms/backoffice/external/lit";

export const analyticsTableFilterActionStyles = css`
  .metric-cell { align-items: center; display: flex; gap: var(--uui-size-space-2); justify-content: flex-end; }
  .filter-action { align-items: center; appearance: none; background: transparent; border: 0; border-radius: var(--uui-border-radius); color: var(--uui-color-text-alt); cursor: pointer; display: inline-flex; font: inherit; justify-content: center; opacity: 0; padding: var(--uui-size-space-2); }
  tbody tr:hover .filter-action, .filter-action:focus-visible, .filter-action[aria-pressed="true"] { opacity: 1; }
  .filter-action:hover { background: color-mix(in srgb, var(--uui-color-interactive) 10%, var(--uui-color-surface)); color: var(--uui-color-interactive-emphasis); }
  .filter-action[aria-pressed="true"] { background: color-mix(in srgb, var(--uui-color-interactive) 15%, var(--uui-color-surface)); color: var(--uui-color-interactive-emphasis); }
  .filter-action:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 1px; }
  @media (hover: none) { .filter-action { opacity: 1; } }
`;

export function renderAnalyticsFilterAction({
  active,
  label,
  toggle,
}: {
  active: boolean;
  label: string;
  toggle: () => void;
}) {
  return html`
    <button
      class="filter-action"
      type="button"
      aria-label=${label}
      aria-pressed=${active}
      title=${label}
      @click=${toggle}>
      <uui-icon name="icon-filter" aria-hidden="true"></uui-icon>
    </button>
  `;
}
