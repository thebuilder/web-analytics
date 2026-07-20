// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  settings: vi.fn(),
  saveSettings: vi.fn(),
  testConnection: vi.fn(),
}));

vi.mock("../api/sdk.gen.js", () => ({ WebAnalyticsService: sdk }));
vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => base,
}));
vi.mock("@umbraco-cms/backoffice/style", () => ({ UmbTextStyles: [] }));
vi.mock("@umbraco-cms/backoffice/document", () => ({}));

import type { AnalyticsConnectionSettingsResponse, AnalyticsSettingsResponse } from "../api/types.gen.js";
import type { VercelAnalyticsSettingsDashboardElement } from "./settings-dashboard.element.js";
import type { VercelAnalyticsConnectionEditorElement } from "./connection-editor.element.js";
import "./settings-dashboard.element.js";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  sdk.settings.mockResolvedValue(apiOk(settings()));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("analytics settings network recovery", () => {
  it("shows a retryable empty state when loading settings rejects", async () => {
    sdk.settings.mockRejectedValueOnce(new Error("Network unavailable"));
    sdk.settings.mockResolvedValueOnce(apiOk(settings()));

    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as VercelAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("umb-empty-state")).not.toBeNull());
    expect(dashboard.shadowRoot?.textContent).toContain("Analytics settings could not be loaded.");

    dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Retry loading settings"]')?.click();

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".page-heading")).not.toBeNull());
    expect(sdk.settings).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an SDK error result", () => sdk.testConnection.mockResolvedValueOnce(apiError())],
    ["a rejected request", () => sdk.testConnection.mockRejectedValueOnce(new Error("Network unavailable"))],
  ])("shows a connection-local error and re-enables testing after %s", async (_description, arrangeResponse) => {
    arrangeResponse();
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection()] })));

    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as VercelAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as VercelAnalyticsConnectionEditorElement;
    editor.dispatchEvent(new CustomEvent("test-connection", { bubbles: true, composed: true }));

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".action-status")?.textContent).toContain("The connection test could not be completed."));
    expect(editor.testing).toBe(false);
    expect(editor.shadowRoot?.querySelector<HTMLElement>('[label="Test the saved connection."]')?.hasAttribute("disabled")).toBe(false);
  });

  it("keeps edits dirty after a rejected save and allows a later save to succeed", async () => {
    sdk.saveSettings.mockRejectedValueOnce(new Error("Network unavailable"));

    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as VercelAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("#default-range")).not.toBeNull());

    const input = dashboard.shadowRoot?.querySelector<HTMLInputElement>("#default-range");
    input!.value = "31";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await dashboard.updateComplete;

    const form = dashboard.shadowRoot?.querySelector("form");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true, composed: true }));

    await vi.waitFor(() => expect(dashboard.shadowRoot?.textContent).toContain("Settings were not saved."));
    expect(dashboard.shadowRoot?.querySelector(".save-bar")).not.toBeNull();
    expect(input!.value).toBe("31");
    expect(dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Save Web Analytics settings"]')?.hasAttribute("disabled")).toBe(false);

    sdk.saveSettings.mockResolvedValueOnce(apiOk(settings({ defaultRangeDays: 31 })));
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true, composed: true }));

    await vi.waitFor(() => expect(dashboard.shadowRoot?.textContent).toContain("Web Analytics settings saved."));
    expect(dashboard.shadowRoot?.querySelector(".save-bar")).toBeNull();
    expect(sdk.saveSettings).toHaveBeenCalledTimes(2);
  });

  it("shows the same save error for an SDK error result", async () => {
    sdk.saveSettings.mockResolvedValueOnce(apiError());

    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as VercelAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("#default-range")).not.toBeNull());

    const input = dashboard.shadowRoot?.querySelector<HTMLInputElement>("#default-range");
    input!.value = "31";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await dashboard.updateComplete;
    dashboard.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true, composed: true }));

    await vi.waitFor(() => expect(dashboard.shadowRoot?.textContent).toContain("Settings were not saved."));
    expect(dashboard.shadowRoot?.querySelector(".save-bar")).not.toBeNull();
    expect(input!.value).toBe("31");
  });
});

function settings(overrides: Partial<AnalyticsSettingsResponse> = {}): AnalyticsSettingsResponse {
  return {
    enabled: true,
    hasAccessToken: false,
    canCreateMockConnections: false,
    defaultRangeDays: 30,
    cacheDuration: "00:05:00",
    connections: [],
    ...overrides,
  };
}

function connection(): AnalyticsConnectionSettingsResponse {
  return {
    key: "connection-1",
    displayName: "Example project",
    projectId: "prj_example",
    team: null,
    documentRootKeys: [],
    enableAllDocumentTypes: false,
    enabledDocumentTypeKeys: [],
    hasAccessToken: true,
    hasAccessTokenOverride: false,
    mockScenario: null,
  };
}

describe("analytics settings onboarding", () => {
  it("guides the first connection without rendering an empty default selector", async () => {
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as VercelAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).not.toBeNull());

    expect(dashboard.shadowRoot?.querySelector("#default-connection")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector(".save-bar")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector(".connection-empty-state h3")?.textContent).toBe("Connect your first Vercel project");

    dashboard.shadowRoot?.querySelector<HTMLElement>(".connection-empty-state uui-button")?.click();
    await dashboard.updateComplete;

    expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector("#default-connection")).toBeNull();
    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor");
    expect(editor).not.toBeNull();
    const generatedKey = (editor as VercelAnalyticsConnectionEditorElement).connection.key;
    expect(generatedKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(editor?.shadowRoot?.querySelector(".token-key code")?.textContent)
      .toBe(`WebAnalytics__ConnectionAccessTokens__${generatedKey}`);
    expect(dashboard.shadowRoot?.querySelector(".unsaved-indicator")?.textContent?.trim()).toBe("Unsaved changes");
    expect(dashboard.shadowRoot?.querySelector(".save-bar")).not.toBeNull();
    expect(dashboard.shadowRoot?.querySelectorAll('[label="Save Web Analytics settings"]')).toHaveLength(1);
    expect(Array.from(editor?.shadowRoot?.querySelectorAll(".essentials uui-input") ?? []).map((input) => input.getAttribute("name"))).toEqual([
      "projectId",
      "teamReference",
    ]);

    dashboard.shadowRoot?.querySelector<HTMLElement>(".section-heading > uui-button")?.click();
    await dashboard.updateComplete;

    const editors = dashboard.shadowRoot?.querySelectorAll("vercel-analytics-connection-editor");
    expect((editors?.[1] as VercelAnalyticsConnectionEditorElement).connection.key).not.toBe(
      (editors?.[0] as VercelAnalyticsConnectionEditorElement).connection.key,
    );
  });

  it("shows the shared token setting before a connection is added", async () => {
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as VercelAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".shared-token")).not.toBeNull());

    expect(dashboard.shadowRoot?.querySelector(".shared-token code")?.textContent).toBe("WebAnalytics__Providers__Vercel__AccessToken");
    expect(dashboard.shadowRoot?.querySelector(".shared-token-status")?.textContent?.trim()).toBe("Not configured");
    expect(dashboard.shadowRoot?.querySelector(".shared-token-help")?.textContent?.trim()).toBe(
      "Set this server environment variable to a Vercel access token.",
    );
    expect(dashboard.shadowRoot?.querySelector(".shared-token-guidance")?.lastElementChild?.tagName).toBe("A");
    expect(dashboard.shadowRoot?.querySelector(".shared-token")?.textContent).not.toContain("Used by all connections");
  });

  it("marks new connections as using the configured shared token", async () => {
    sdk.settings.mockResolvedValue(apiOk({
      enabled: true,
      hasAccessToken: true,
      canCreateMockConnections: false,
      defaultRangeDays: 30,
      cacheDuration: "00:05:00",
      connections: [],
    }));
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as VercelAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).not.toBeNull());

    expect(dashboard.shadowRoot?.querySelector(".shared-token-status")?.textContent?.trim()).toBe("Configured");
    expect(dashboard.shadowRoot?.querySelector(".shared-token-setup")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector(".shared-token code")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector('.shared-token a[href*="vercel.com/account/settings/tokens"]')).toBeNull();
    expect(dashboard.shadowRoot?.querySelector('[label="Copy shared access token setting name"]')).toBeNull();
    dashboard.shadowRoot?.querySelector<HTMLElement>(".connection-empty-state uui-button")?.click();
    await dashboard.updateComplete;

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as VercelAnalyticsConnectionEditorElement;
    expect(editor.connection.hasAccessToken).toBe(true);
    expect(editor.connection.hasAccessTokenOverride).toBe(false);
    expect(editor.shadowRoot?.querySelector(".summary-state uui-tag")?.textContent?.trim()).toBe("Shared token");
  });

  it("adds development mock scenarios as deterministic connections", async () => {
    sdk.settings.mockResolvedValue(apiOk({
      enabled: true,
      hasAccessToken: false,
      canCreateMockConnections: true,
      defaultRangeDays: 30,
      cacheDuration: "00:05:00",
      connections: [],
    }));
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as VercelAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".mock-settings")).not.toBeNull());

    const buttons = dashboard.shadowRoot?.querySelectorAll<HTMLElement>(".mock-scenario uui-button");
    expect(buttons).toHaveLength(4);
    expect(buttons?.[0].getAttribute("label")).toBe("Add Demo mock connection");
    buttons?.[1].click();
    await dashboard.updateComplete;

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as VercelAnalyticsConnectionEditorElement;
    expect(editor.connection).toMatchObject({
      displayName: "Mock · UTM campaigns",
      projectId: "",
      hasAccessToken: false,
      mockScenario: "Utm",
    });
    expect(editor.shadowRoot?.querySelector(".summary-state uui-tag")?.textContent?.trim()).toBe("Development mock");
    expect(editor.shadowRoot?.querySelector(".token-section")).toBeNull();
    expect(buttons?.[1].hasAttribute("disabled")).toBe(true);
  });
});

function apiOk<T>(data: T) {
  return { data, error: undefined, request: new Request("https://example.com"), response: new Response(null, { status: 200 }) };
}

function apiError() {
  return { data: undefined, error: { message: "Request failed" }, request: new Request("https://example.com"), response: new Response(null, { status: 500 }) };
}
