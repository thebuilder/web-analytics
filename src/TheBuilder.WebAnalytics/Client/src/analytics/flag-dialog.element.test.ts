// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => class extends base {
    readonly localize = {
      number: (value: string | number) => new Intl.NumberFormat("en-US").format(Number(value)),
    };
  },
}));
vi.mock("@umbraco-cms/backoffice/style", () => ({ UmbTextStyles: [] }));

import { successState } from "./async-state.js";
import type { WebAnalyticsFlagDialogElement } from "./flag-dialog.element.js";
import type { WebAnalyticsFlagTableElement } from "./flag-table.element.js";
import "./flag-dialog.element.js";

beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); });
afterEach(() => document.body.replaceChildren());

describe("flag dialog", () => {
  it("renders the complete flag list as selectable rows", async () => {
    const dialog = document.createElement("web-analytics-flag-dialog") as WebAnalyticsFlagDialogElement;
    dialog.report = successState({ rows: [{ value: "summer-sale", visitors: 184, pageViews: 841 }] });
    document.body.append(dialog);
    await dialog.updateComplete;

    const table = dialog.shadowRoot?.querySelector<WebAnalyticsFlagTableElement>("web-analytics-flag-table");
    expect(dialog.shadowRoot?.querySelector("dialog")?.getAttribute("aria-label")).toBe("Flags");
    expect(table?.mode).toBe("list");
  });

  it("renders selected flag values and returns to the list", async () => {
    const dialog = document.createElement("web-analytics-flag-dialog") as WebAnalyticsFlagDialogElement;
    dialog.report = successState({ rows: [{ value: "summer-sale", visitors: 184, pageViews: 841 }] });
    dialog.selected = {
      flagKey: "summer-sale",
      report: successState({ flagKey: "summer-sale", rows: [{ value: "true", visitors: 53, pageViews: 200 }] }),
    };
    dialog.flagFilter = { flagKey: "summer-sale", value: "true" };
    const onBack = vi.fn();
    dialog.addEventListener("clear-selected-flag", onBack);
    document.body.append(dialog);
    await dialog.updateComplete;

    const table = dialog.shadowRoot?.querySelector<WebAnalyticsFlagTableElement>("web-analytics-flag-table");
    const back = dialog.shadowRoot?.querySelector<HTMLButtonElement>(".analytics-dialog-back");
    expect(dialog.shadowRoot?.querySelector("dialog")?.getAttribute("aria-label")).toBe("summer-sale flag details");
    expect(back?.textContent?.trim()).toBe("summer-sale");
    expect(table?.mode).toBe("detail");
    expect(table?.flagKey).toBe("summer-sale");
    expect(table?.flagFilter).toEqual({ flagKey: "summer-sale", value: "true" });

    back?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
