import { css, html } from "@umbraco-cms/backoffice/external/lit";

export const renderAnalyticsTableSkeletonRows = (count: number) => Array.from({ length: count }, () => html`
  <tr aria-hidden="true">
    <th scope="row"><span class="skeleton-line"></span></th>
    <td><span class="skeleton-number"></span></td>
    <td><span class="skeleton-number"></span></td>
  </tr>
`);

export const analyticsTableSkeletonStyles = css`
  .skeleton-line, .skeleton-number {
    background: var(--uui-color-surface-alt);
    block-size: 1lh;
    border-radius: var(--uui-border-radius);
    display: block;
  }
  .skeleton-line { inline-size: 70%; }
  .skeleton-number { inline-size: 3.5rem; margin-inline-start: auto; }
`;
