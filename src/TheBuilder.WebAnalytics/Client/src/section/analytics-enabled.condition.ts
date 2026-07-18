import { UmbConditionBase } from "@umbraco-cms/backoffice/extension-registry";
import type { UmbConditionConfigBase, UmbExtensionCondition } from "@umbraco-cms/backoffice/extension-api";
import { WebAnalyticsService } from "../api/sdk.gen.js";
import {
  ANALYTICS_AVAILABILITY_CHANGED_EVENT,
  type AnalyticsAvailabilityChangedDetail,
} from "./analytics-availability.js";

export class AnalyticsEnabledCondition extends UmbConditionBase<UmbConditionConfigBase> implements UmbExtensionCondition {
  #request = 0;

  constructor(
    host: ConstructorParameters<typeof UmbConditionBase<UmbConditionConfigBase>>[0],
    args: ConstructorParameters<typeof UmbConditionBase<UmbConditionConfigBase>>[1],
  ) {
    super(host, args);
    this.permitted = false;
    window.addEventListener(ANALYTICS_AVAILABILITY_CHANGED_EVENT, this.#onAvailabilityChanged);
    void this.#evaluate();
  }

  #onAvailabilityChanged = (event: Event): void => {
    const detail = (event as CustomEvent<AnalyticsAvailabilityChangedDetail>).detail;
    if (typeof detail?.enabled === "boolean") this.permitted = detail.enabled;
  };

  async #evaluate(): Promise<void> {
    const request = ++this.#request;
    const { data, error } = await WebAnalyticsService.connections();
    if (request === this.#request) this.permitted = !error && data?.enabled === true;
  }

  override destroy(): void {
    this.#request++;
    window.removeEventListener(ANALYTICS_AVAILABILITY_CHANGED_EVENT, this.#onAvailabilityChanged);
    super.destroy();
  }
}

export { AnalyticsEnabledCondition as api };
