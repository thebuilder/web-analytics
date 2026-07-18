import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from "@umbraco-cms/backoffice/document";
import { UmbConditionBase } from "@umbraco-cms/backoffice/extension-registry";
import type { UmbConditionConfigBase, UmbExtensionCondition } from "@umbraco-cms/backoffice/extension-api";
import { WebAnalyticsService } from "../api/sdk.gen.js";

export class DocumentAnalyticsCondition extends UmbConditionBase<UmbConditionConfigBase> implements UmbExtensionCondition {
  #request = 0;

  constructor(host: ConstructorParameters<typeof UmbConditionBase<UmbConditionConfigBase>>[0], args: ConstructorParameters<typeof UmbConditionBase<UmbConditionConfigBase>>[1]) {
    super(host, args);
    this.permitted = false;
    this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.unique, (unique) => void this.#evaluate(unique ?? undefined), "vercelAnalyticsConditionUnique");
      this.observe(context.splitView.firstActiveVariantInfo, () => void this.#evaluate(context.getUnique() ?? undefined), "vercelAnalyticsConditionCulture");
    });
  }

  async #evaluate(documentId?: string): Promise<void> {
    const request = ++this.#request;
    if (!documentId) {
      this.permitted = false;
      return;
    }
    const { data, error } = await WebAnalyticsService.documentRoutes({ path: { documentId } });
    if (request === this.#request) this.permitted = !error && Boolean(data?.length);
  }
}

export { DocumentAnalyticsCondition as api };
