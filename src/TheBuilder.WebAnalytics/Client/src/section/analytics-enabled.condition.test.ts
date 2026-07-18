// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ connections: vi.fn() }));

vi.mock("../api/sdk.gen.js", () => ({ WebAnalyticsService: sdk }));
vi.mock("@umbraco-cms/backoffice/extension-registry", () => ({
  UmbConditionBase: class {
    #permitted = false;
    #onChange?: (permitted: boolean) => void;

    constructor(_host: unknown, args: { onChange: (permitted: boolean) => void }) {
      this.#onChange = args.onChange;
    }

    get permitted(): boolean { return this.#permitted; }
    set permitted(value: boolean) {
      if (value === this.#permitted) return;
      this.#permitted = value;
      this.#onChange?.(value);
    }

    destroy(): void { this.#onChange = undefined; }
  },
}));

import { announceAnalyticsAvailability } from "./analytics-availability.js";
import { AnalyticsEnabledCondition } from "./analytics-enabled.condition.js";

let condition: AnalyticsEnabledCondition | undefined;

afterEach(() => {
  condition?.destroy();
  condition = undefined;
  vi.clearAllMocks();
});

describe("AnalyticsEnabledCondition", () => {
  it("permits the section only when saved settings are enabled", async () => {
    sdk.connections.mockResolvedValue({ data: { enabled: true }, error: undefined });
    condition = new AnalyticsEnabledCondition({} as never, {
      config: { alias: "TheBuilder.WebAnalytics.Condition.AnalyticsEnabled" },
      onChange: vi.fn(),
    });

    await vi.waitFor(() => expect(condition?.permitted).toBe(true));

    announceAnalyticsAvailability(false);
    expect(condition.permitted).toBe(false);
  });

  it("fails closed when availability cannot be loaded", async () => {
    sdk.connections.mockResolvedValue({ data: undefined, error: { status: 403 } });
    condition = new AnalyticsEnabledCondition({} as never, {
      config: { alias: "TheBuilder.WebAnalytics.Condition.AnalyticsEnabled" },
      onChange: vi.fn(),
    });

    await vi.waitFor(() => expect(sdk.connections).toHaveBeenCalledOnce());
    expect(condition.permitted).toBe(false);
  });
});
