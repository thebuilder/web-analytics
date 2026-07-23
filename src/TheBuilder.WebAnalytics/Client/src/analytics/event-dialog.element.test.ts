// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => base,
}));
vi.mock("@umbraco-cms/backoffice/style", () => ({ UmbTextStyles: [] }));

import type { WebAnalyticsEventDialogElement } from "./event-dialog.element.js";
import "./event-dialog.element.js";

beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); });
afterEach(() => document.body.replaceChildren());

describe("events dialog", () => {
  it("keeps its accessible name without repeating a visible title", async () => {
    const dialog = document.createElement("web-analytics-event-dialog") as WebAnalyticsEventDialogElement;
    document.body.append(dialog);
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector("dialog")?.getAttribute("aria-label")).toBe("Events");
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-headline h2")).toBeNull();
    expect(dialog.shadowRoot?.querySelector("uui-input")?.getAttribute("label")).toBe("Search events");
    expect(dialog.shadowRoot?.querySelector(".analytics-dialog-close")?.getAttribute("aria-label")).toBe("Close events");
  });
});
