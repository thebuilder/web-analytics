import { css } from "@umbraco-cms/backoffice/external/lit";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";

export const analyticsDashboardStyles = [UmbTextStyles, css`
  :host { display: block; }
  main { container-type: inline-size; margin-inline: auto; max-width: 110rem; padding: var(--uui-size-layout-1); }
  .connection-setup-region { display: grid; min-block-size: min(28rem, 55vh); padding: var(--uui-size-layout-1); place-items: center; }
  .connection-setup { align-items: start; background: color-mix(in srgb, var(--uui-color-warning) 7%, var(--uui-color-surface)); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); box-sizing: border-box; display: grid; gap: var(--uui-size-space-4); grid-template-columns: auto minmax(0, 1fr); inline-size: 100%; max-inline-size: 46rem; padding: var(--uui-size-layout-1); }
  .connection-setup > uui-icon { color: var(--uui-color-warning-standalone); font-size: var(--uui-type-h4-size); margin-block-start: var(--uui-size-space-1); }
  .connection-setup-content { align-items: flex-start; display: flex; flex-direction: column; gap: var(--uui-size-space-3); min-inline-size: 0; }
  .connection-setup h2 { font-size: var(--uui-type-h4-size); font-weight: 400; line-height: var(--uui-type-h4-line-height); margin: 0; }
  .connection-setup p { color: var(--uui-color-text-alt); margin: 0 0 var(--uui-size-space-2); max-inline-size: 65ch; }
  .active-filters { align-items: center; background: color-mix(in srgb, var(--uui-color-interactive) 3%, var(--uui-color-surface)); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); display: flex; gap: var(--uui-size-space-3); margin-bottom: var(--uui-size-space-5); min-inline-size: 0; padding: var(--uui-size-space-2); }
  .filter-heading { align-items: center; color: var(--uui-color-text-alt); display: flex; flex: 0 0 auto; gap: var(--uui-size-space-2); padding-inline: var(--uui-size-space-2); }
  .filter-heading uui-icon { color: var(--uui-color-interactive); }
  .filter-list { align-items: center; display: flex; flex: 1 1 auto; flex-wrap: wrap; gap: var(--uui-size-space-2); min-inline-size: 0; }
  .filter-badge { align-items: center; appearance: none; background: var(--uui-color-surface); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); color: var(--uui-color-text); cursor: pointer; display: inline-flex; font: inherit; gap: var(--uui-size-space-2); max-inline-size: min(32rem, 100%); min-block-size: 2rem; min-inline-size: 0; padding: var(--uui-size-space-1) var(--uui-size-space-2); }
  .filter-badge:hover { background: color-mix(in srgb, var(--uui-color-interactive) 6%, var(--uui-color-surface)); border-color: var(--uui-color-interactive); }
  .filter-badge:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
  .filter-icon { flex: 0 0 auto; }
  img.filter-icon { object-fit: contain; }
  img.filter-flag { border-radius: var(--uui-border-radius); object-fit: cover; }
  uui-icon.filter-icon { font-size: var(--uui-type-default-size); }
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
