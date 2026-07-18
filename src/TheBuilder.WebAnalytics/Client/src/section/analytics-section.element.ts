import { LitElement, customElement, html } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import "../analytics/analytics-dashboard.element.js";

@customElement("vercel-analytics-section")
export class VercelAnalyticsSectionElement extends UmbElementMixin(LitElement) {
  render() {
    return html`<vercel-analytics-dashboard></vercel-analytics-dashboard>`;
  }
}

export default VercelAnalyticsSectionElement;

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-section": VercelAnalyticsSectionElement;
  }
}
