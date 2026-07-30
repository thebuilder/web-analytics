import { LitElement, customElement, html, property } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AnalyticsFlagsReport } from "../api/types.gen.js";
import { renderAnalyticsDialogFrame } from "./analytics-dialog-frame.js";
import { analyticsDialogStyles } from "./analytics-dialog.styles.js";
import { isInitialLoading, stateData, type AsyncState } from "./async-state.js";
import { openDialog } from "./dialog-lifecycle.js";
import type { AnalyticsFlagFilter } from "./dashboard-url-state.js";
import type { SelectedFlag } from "./dashboard-drilldown-state.js";
import "./flag-table.element.js";

@customElement("web-analytics-flag-dialog")
export class WebAnalyticsFlagDialogElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) report: AsyncState<AnalyticsFlagsReport> = { status: "loading" };
  @property({ attribute: false }) selected?: SelectedFlag;
  @property({ attribute: false }) flagFilter?: AnalyticsFlagFilter;

  protected firstUpdated(): void { openDialog(this); }

  #back(selectedKey: string) {
    return html`
      <button type="button" class="analytics-dialog-back" aria-label=${`Back to all flags from ${selectedKey}`} title="Back to all flags" @click=${() => {
        this.dispatchEvent(new CustomEvent("clear-selected-flag", { bubbles: true, composed: true }));
      }}>
        <uui-icon name="icon-navigation-left" aria-hidden="true"></uui-icon>
        <span>${selectedKey}</span>
      </button>
    `;
  }

  render() {
    const activeState = this.selected?.report ?? this.report;
    const data = stateData(activeState);
    const selectedKey = this.selected?.flagKey;
    return renderAnalyticsDialogFrame({
      host: this,
      ariaLabel: selectedKey ? `${selectedKey} flag details` : "Flags",
      closeLabel: "Close flags",
      headline: selectedKey ? this.#back(selectedKey) : "Flags",
      body: html`
        <div class="analytics-dialog-body" aria-busy=${activeState.status === "loading" ? "true" : "false"}>
          ${activeState.status === "error" ? html`<umb-empty-state headline="Flags unavailable"><p>${activeState.message}</p></umb-empty-state>` : html`
            <web-analytics-flag-table
              .rows=${data?.rows ?? []}
              .loading=${isInitialLoading(activeState)}
              .flagKey=${selectedKey}
              .flagFilter=${this.flagFilter}
              .mode=${selectedKey ? "detail" : "list"}></web-analytics-flag-table>
          `}
        </div>
      `,
    });
  }

  static styles = [UmbTextStyles, analyticsDialogStyles];
}

declare global { interface HTMLElementTagNameMap { "web-analytics-flag-dialog": WebAnalyticsFlagDialogElement; } }
