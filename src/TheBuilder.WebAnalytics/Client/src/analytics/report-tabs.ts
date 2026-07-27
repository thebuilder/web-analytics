import { css, html, nothing } from "@umbraco-cms/backoffice/external/lit";
import { targetTabIndex } from "./tab-keyboard.js";

export type ReportTabOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

export type ReportTabGroup<TValue extends string = string> = {
  ariaLabel: string;
  idPrefix: string;
  options: ReadonlyArray<ReportTabOption<TValue>>;
  selected: TValue;
  appearance?: "primary" | "secondary";
};

export function selectedReportTabId(group: ReportTabGroup): string | undefined {
  const index = group.options.findIndex(({ value }) => value === group.selected);
  return index >= 0 ? `${group.idPrefix}-${index}` : undefined;
}

export function renderReportTabs<TValue extends string>(
  group: ReportTabGroup<TValue>,
  onSelect: (value: TValue) => void,
  panelId?: string,
) {
  const select = (value: TValue): void => {
    if (value !== group.selected) onSelect(value);
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from((event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? []);
    const targetIndex = targetTabIndex(event, tabs);
    const option = group.options[targetIndex];
    if (!option) return;
    select(option.value);
    queueMicrotask(() => tabs[targetIndex]?.focus());
  };

  return html`
    <div class=${`report-tabs ${group.appearance ?? "primary"}`} role="tablist" aria-label=${group.ariaLabel}>
      ${group.options.map(({ value, label }, index) => html`
        <button
          id=${`${group.idPrefix}-${index}`}
          data-tab-index=${index}
          type="button"
          role="tab"
          aria-controls=${panelId ?? nothing}
          aria-selected=${group.selected === value}
          tabindex=${group.selected === value ? 0 : -1}
          @click=${() => select(value)}
          @keydown=${onKeydown}>${label}</button>
      `)}
    </div>
  `;
}

export const reportTabsStyles = css`
  .report-tabs {
    align-items: stretch;
    display: flex;
    margin: var(
      --analytics-report-tabs-margin,
      calc(-1 * var(--uui-size-space-3)) calc(-1 * var(--uui-size-space-5))
    );
    min-inline-size: 0;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: thin;
  }
  .report-tabs button {
    appearance: none;
    background: transparent;
    border: 0;
    box-sizing: border-box;
    color: var(--uui-color-text-alt);
    cursor: pointer;
    flex: 0 0 auto;
    font: inherit;
    min-block-size: calc(2.5rem - 0.5px);
    padding: var(--uui-size-space-3) var(--uui-size-space-5);
    white-space: nowrap;
  }
  .report-tabs button:hover { background: color-mix(in srgb, var(--uui-color-selected) 7%, transparent); color: var(--uui-color-text); }
  .report-tabs button[aria-selected="true"] { box-shadow: inset 0 -3px var(--uui-color-selected); color: var(--uui-color-text); font-weight: 700; }
  .report-tabs button:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -3px; }
  .report-tabs.secondary {
    align-items: stretch;
    gap: 0;
    margin: var(--analytics-report-tabs-secondary-margin, 0 calc(-1 * var(--uui-size-space-3)));
    padding-block: 0;
  }
  .report-tabs.secondary button {
    min-block-size: 2.5rem;
    padding: var(--uui-size-space-3);
  }
  .report-tabs.secondary button[aria-selected="true"] { background: transparent; box-shadow: inset 0 -2px var(--uui-color-selected); }
  @media (pointer: coarse) {
    .report-tabs.secondary button { min-block-size: 2.75rem; }
  }
  @media (forced-colors: active) {
    .report-tabs button[aria-selected="true"] { box-shadow: inset 0 -3px Highlight; }
    .report-tabs.secondary button[aria-selected="true"] { outline: 2px solid Highlight; }
  }
`;
