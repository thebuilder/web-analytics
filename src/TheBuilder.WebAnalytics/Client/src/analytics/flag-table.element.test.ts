// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => class extends base {
    readonly localize = {
      number: (value: string | number) => new Intl.NumberFormat("en-US").format(Number(value)),
    };
  },
}));

import type { WebAnalyticsFlagTableElement } from "./flag-table.element.js";
import { analyticsTableSkeletonStyles } from "./analytics-table-skeleton.js";
import "./flag-table.element.js";

afterEach(() => document.body.replaceChildren());

describe("flag table", () => {
  it("keeps the loading announcement visually hidden", async () => {
    const table = document.createElement("web-analytics-flag-table") as WebAnalyticsFlagTableElement;
    table.loading = true;
    document.body.append(table);
    await table.updateComplete;

    const status = table.shadowRoot?.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("Loading feature flags");
    expect(status?.classList.contains("visually-hidden")).toBe(true);
    expect(analyticsTableSkeletonStyles.cssText).toContain(".visually-hidden");
  });

  it("selects flag keys in list mode", async () => {
    const table = document.createElement("web-analytics-flag-table") as WebAnalyticsFlagTableElement;
    table.mode = "list";
    table.rows = [{ value: "summer-sale", visitors: 184, pageViews: 841 }];
    const onSelect = vi.fn();
    table.addEventListener("select-flag", onSelect);
    document.body.append(table);
    await table.updateComplete;

    table.shadowRoot?.querySelector<HTMLButtonElement>(".row-action")?.click();

    expect((onSelect.mock.calls[0][0] as CustomEvent).detail).toEqual({ flagKey: "summer-sale" });
    expect(table.shadowRoot?.querySelector(".row-value")).toBeNull();
  });

  it("renders flag values as text in detail mode", async () => {
    const table = document.createElement("web-analytics-flag-table") as WebAnalyticsFlagTableElement;
    table.mode = "detail";
    table.rows = [{ value: "true", visitors: 53, pageViews: 200 }];
    document.body.append(table);
    await table.updateComplete;

    expect(table.shadowRoot?.querySelector("tbody .row-value")?.textContent).toBe("true");
    expect(table.shadowRoot?.querySelector(".row-action")).toBeNull();
  });

  it("filters analytics by a drilled-in flag value", async () => {
    const table = document.createElement("web-analytics-flag-table") as WebAnalyticsFlagTableElement;
    table.mode = "detail";
    table.flagKey = "new-pricing-page";
    table.flagFilter = { flagKey: "new-pricing-page", value: "control" };
    table.rows = [{ value: "control", visitors: 53, pageViews: 200 }];
    const onFilter = vi.fn();
    table.addEventListener("toggle-flag-filter", onFilter);
    document.body.append(table);
    await table.updateComplete;

    const action = table.shadowRoot?.querySelector<HTMLButtonElement>(".filter-action");
    expect(action?.getAttribute("aria-pressed")).toBe("true");
    expect(action?.getAttribute("aria-label")).toContain("Remove new-pricing-page flag value filter control");
    action?.click();

    expect((onFilter.mock.calls[0][0] as CustomEvent).detail).toEqual({
      flagKey: "new-pricing-page",
      value: "control",
    });

    table.mode = "list";
    await table.updateComplete;
    expect(table.shadowRoot?.querySelector(".filter-action")).toBeNull();
  });

  it("shows and removes the active flag value on the overview row", async () => {
    const table = document.createElement("web-analytics-flag-table") as WebAnalyticsFlagTableElement;
    table.mode = "overview";
    table.flagFilter = { flagKey: "new-pricing-page", value: "control" };
    table.rows = [{ value: "new-pricing-page", visitors: 53, pageViews: 200 }];
    const onFilter = vi.fn();
    table.addEventListener("toggle-flag-filter", onFilter);
    document.body.append(table);
    await table.updateComplete;

    const filter = table.shadowRoot?.querySelector<HTMLButtonElement>(".drilldown-filter");
    expect(filter?.textContent?.trim()).toBe("control");
    expect(filter?.getAttribute("aria-label")).toBe("Remove new-pricing-page flag value filter control");
    expect(filter?.parentElement?.classList.contains("row-heading-content")).toBe(true);
    filter?.click();

    expect((onFilter.mock.calls[0][0] as CustomEvent).detail).toEqual({
      flagKey: "new-pricing-page",
      value: "control",
    });
  });

  it("shows setup guidance only in overview mode", async () => {
    const table = document.createElement("web-analytics-flag-table") as WebAnalyticsFlagTableElement;
    table.mode = "overview";
    document.body.append(table);
    await table.updateComplete;

    const setupLink = table.shadowRoot?.querySelector<HTMLAnchorElement>(".empty a");
    expect(table.shadowRoot?.querySelector(".empty-icon uui-icon")?.getAttribute("name")).toBe("icon-flag");
    expect(setupLink?.href).toBe("https://vercel.com/docs/flags/observability/web-analytics");
    expect(setupLink?.rel).toBe("noopener noreferrer");

    table.mode = "list";
    await table.updateComplete;
    expect(table.shadowRoot?.querySelector(".empty a")).toBeNull();
  });
});
