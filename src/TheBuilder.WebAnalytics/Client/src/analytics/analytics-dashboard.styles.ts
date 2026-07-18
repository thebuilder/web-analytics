import { css } from "@umbraco-cms/backoffice/external/lit";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";

export const analyticsDashboardStyles = [UmbTextStyles, css`
  :host { display: block; }
  main { container-type: inline-size; margin-inline: auto; max-width: 110rem; padding: var(--uui-size-layout-1); }
  .active-filters { align-items: center; background: color-mix(in srgb, var(--uui-color-interactive) 3%, var(--uui-color-surface)); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); display: flex; gap: var(--uui-size-space-3); margin-bottom: var(--uui-size-space-5); min-inline-size: 0; padding: var(--uui-size-space-2); }
  .filter-heading { align-items: center; color: var(--uui-color-text-alt); display: flex; flex: 0 0 auto; gap: var(--uui-size-space-2); padding-inline: var(--uui-size-space-2); }
  .filter-heading uui-icon { color: var(--uui-color-interactive); }
  .filter-list { align-items: center; display: flex; flex: 1 1 auto; flex-wrap: wrap; gap: var(--uui-size-space-2); min-inline-size: 0; }
  .filter-badge { align-items: center; appearance: none; background: var(--uui-color-surface); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); color: var(--uui-color-text); cursor: pointer; display: inline-flex; font: inherit; gap: var(--uui-size-space-2); max-inline-size: min(32rem, 100%); min-block-size: 2rem; min-inline-size: 0; padding: var(--uui-size-space-1) var(--uui-size-space-2); }
  .filter-badge:hover { background: color-mix(in srgb, var(--uui-color-interactive) 6%, var(--uui-color-surface)); border-color: var(--uui-color-interactive); }
  .filter-badge:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
  .filter-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .filter-remove { color: var(--uui-color-text-alt); flex: 0 0 auto; font-size: 1.1em; line-height: 1; }
  .clear-filters { flex: 0 0 auto; }
  @container (max-width: 32rem) {
    .active-filters { align-items: stretch; flex-wrap: wrap; }
    .filter-heading { flex: 1 1 auto; }
    .filter-list { flex-basis: 100%; order: 3; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; } }
`];
