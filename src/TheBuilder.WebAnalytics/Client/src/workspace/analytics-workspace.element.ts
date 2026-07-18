import { LitElement, customElement, html, state } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from "@umbraco-cms/backoffice/document";
import { UMB_APP_LANGUAGE_CONTEXT } from "@umbraco-cms/backoffice/language";
import { workspaceAnalyticsCulture } from "../analytics/document-route.js";
import "../analytics/analytics-dashboard.element.js";

@customElement("vercel-analytics-workspace")
export class VercelAnalyticsWorkspaceElement extends UmbElementMixin(LitElement) {
  @state() private _documentId?: string;
  @state() private _variantCulture?: string;
  @state() private _appCulture?: string;

  constructor() {
    super();
    this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.unique, (unique) => (this._documentId = unique ?? undefined), "vercelAnalyticsDocumentUnique");
      this.observe(context.splitView.firstActiveVariantInfo, (variant) => (this._variantCulture = variant?.culture ?? undefined), "vercelAnalyticsCulture");
    });
    this.consumeContext(UMB_APP_LANGUAGE_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.appLanguageCulture, (culture) => (this._appCulture = culture ?? undefined), "vercelAnalyticsAppCulture");
    });
  }

  render() {
    const culture = workspaceAnalyticsCulture(this._variantCulture, this._appCulture);
    return this._documentId
      ? html`<vercel-analytics-dashboard .documentId=${this._documentId} .culture=${culture}></vercel-analytics-dashboard>`
      : html`<uui-loader-bar aria-label="Loading document analytics"></uui-loader-bar>`;
  }
}

export default VercelAnalyticsWorkspaceElement;

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-workspace": VercelAnalyticsWorkspaceElement;
  }
}
