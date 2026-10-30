import { css } from "@umbraco-cms/backoffice/external/lit";

// True when a click on a filterable row landed on the row itself rather than on a control inside it
// (a label button, a link, a focusable tooltip) or ended a text selection. Only the part of the
// event path inside the row counts, because the backoffice wraps dashboards in focusable containers.
export function isPlainRowClick(event: Event, root: ShadowRoot | null): boolean {
  const path = event.composedPath();
  const insideRow = path.slice(0, path.indexOf(event.currentTarget as EventTarget));
  if (insideRow.some((target) => target instanceof HTMLElement && target.matches("a, button, [tabindex]"))) return false;
  const selection = (root as (ShadowRoot & { getSelection?: () => Selection | null }) | null)?.getSelection?.() ?? document.getSelection();
  return !selection?.toString();
}

// A row label that toggles its row's filter, highlighted while the filter is active.
export const analyticsRowFilterStyles = css`
  .filter-row { cursor: pointer; }
  .row-filter { appearance: none; background: transparent; border: 0; color: inherit; cursor: pointer; font: inherit; min-inline-size: 0; padding: 0; position: relative; text-align: left; z-index: 1; }
  .filter-row:hover .row-filter { text-decoration: underline; text-underline-offset: 0.12em; }
  .row-filter:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
  .row-filter[aria-pressed="true"] { color: var(--uui-color-interactive-emphasis); font-weight: 700; }
`;
