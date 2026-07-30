import { html, type TemplateResult } from "@umbraco-cms/backoffice/external/lit";
import { renderAnalyticsDialogHeadline } from "./analytics-dialog-headline.js";
import { cancelDialog, closeDialog, notifyDialogClosed } from "./dialog-lifecycle.js";

export type AnalyticsDialogFrame = {
  host: HTMLElement;
  ariaLabel: string;
  closeLabel: string;
  headline: string | TemplateResult;
  body: TemplateResult;
  controls?: TemplateResult;
  showHeadline?: boolean;
};

export function renderAnalyticsDialogFrame({
  host,
  ariaLabel,
  closeLabel,
  headline,
  body,
  controls,
  showHeadline = true,
}: AnalyticsDialogFrame): TemplateResult {
  return html`
    <dialog
      aria-label=${ariaLabel}
      @cancel=${(event: Event) => cancelDialog(event, host)}
      @close=${() => notifyDialogClosed(host, "analytics-dialog-close")}>
      <div class="analytics-dialog-layout">
        ${renderAnalyticsDialogHeadline(headline, closeLabel, () => closeDialog(host), controls, showHeadline)}
        ${body}
      </div>
    </dialog>
  `;
}
