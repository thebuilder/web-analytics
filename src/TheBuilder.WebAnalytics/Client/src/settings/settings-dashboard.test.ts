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
import type { WebAnalyticsSettingsDashboardElement } from "./settings-dashboard.element.js";
import type { AnalyticsConnectionEditorElement } from "./connection-editor.element.js";
import "./settings-dashboard.element.js";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
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

    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("umb-empty-state")).not.toBeNull());
    expect(dashboard.shadowRoot?.textContent).toContain("Analytics settings could not be loaded.");

    dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Retry loading settings"]')?.click();

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connections-section")).not.toBeNull());
    expect(sdk.settings).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an SDK error result", () => sdk.testConnection.mockResolvedValueOnce(apiError())],
    ["a rejected request", () => sdk.testConnection.mockRejectedValueOnce(new Error("Network unavailable"))],
  ])("shows a connection-local error and re-enables testing after %s", async (_description, arrangeResponse) => {
    arrangeResponse();
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection()] })));

    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    editor.dispatchEvent(new CustomEvent("test-connection", { bubbles: true, composed: true }));

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".action-status")?.textContent).toContain("The connection test could not be completed."));
    expect(editor.testing).toBe(false);
    expect(editor.shadowRoot?.querySelector<HTMLElement>('[label="Test the saved connection."]')?.hasAttribute("disabled")).toBe(false);
  });

  it("promotes a successful connection test into the connection summary", async () => {
    sdk.testConnection.mockResolvedValueOnce(apiOk({ success: true, message: "Connection successful." }));
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection()] })));
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    editor.dispatchEvent(new CustomEvent("test-connection", { bubbles: true, composed: true }));

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".summary-health uui-tag")?.textContent?.trim()).toBe("Connected"));
    expect(editor.shadowRoot?.querySelector(".action-status")?.textContent).toContain("Connection successful.");
  });

  it("keeps edits dirty after a rejected save and allows a later save to succeed", async () => {
    sdk.saveSettings.mockRejectedValueOnce(new Error("Network unavailable"));

    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
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

    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
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
    providerTokens: [{ provider: "Vercel", hasAccessToken: false }, { provider: "Plausible", hasAccessToken: false }],
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
    provider: "Vercel",
    projectId: "prj_example",
    team: null,
    siteId: "",
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
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).not.toBeNull());

    expect(dashboard.shadowRoot?.querySelector("#default-connection")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector("h1")).toBeNull();
    expect(dashboard.shadowRoot?.textContent).not.toContain("Connect analytics providers and choose where page analytics appears.");
    expect(dashboard.shadowRoot?.querySelector(".save-bar")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector(".connection-empty-state h3")?.textContent).toBe("Connect your first analytics provider");

    dashboard.shadowRoot?.querySelector<HTMLElement>('.connection-empty-state [label="Choose analytics provider"]')?.click();
    await dashboard.updateComplete;

    const choices = dashboard.shadowRoot?.querySelectorAll<HTMLElement>(".provider-choice");
    expect(choices).toHaveLength(2);
    expect(choices?.[0].querySelector(".provider-logo.vercel")).not.toBeNull();
    expect(choices?.[1].querySelector(".provider-logo.plausible")).not.toBeNull();
    const plausibleLogo = choices?.[1].querySelector<HTMLImageElement>(".provider-logo.plausible");
    expect(plausibleLogo?.getAttribute("src")).toBe("/App_Plugins/TheBuilder.WebAnalytics/icons/providers/plausible.svg");
    expect(plausibleLogo?.getAttribute("alt")).toBe("");
    expect(plausibleLogo?.width).toBe(24);
    expect(plausibleLogo?.height).toBe(24);
    choices?.[0].click();
    await dashboard.updateComplete;

    expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector("#default-connection")).toBeNull();
    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor");
    expect(editor).not.toBeNull();
    const generatedKey = (editor as AnalyticsConnectionEditorElement).connection.key;
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
    dashboard.shadowRoot?.querySelector<HTMLElement>('.section-heading [label="Add analytics connection"]')?.click();
    await dashboard.updateComplete;
    dashboard.shadowRoot?.querySelector<HTMLElement>('.provider-choice[aria-label="Add Plausible connection"]')?.click();
    await dashboard.updateComplete;

    const editors = dashboard.shadowRoot?.querySelectorAll("vercel-analytics-connection-editor");
    expect((editors?.[1] as AnalyticsConnectionEditorElement).connection.key).not.toBe(
      (editors?.[0] as AnalyticsConnectionEditorElement).connection.key,
    );
    expect((editors?.[1] as AnalyticsConnectionEditorElement).connection.provider).toBe("Plausible");
  });

  it("shows provider readiness without exposing server configuration keys", async () => {
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".provider-row")).not.toBeNull());

    const providers = dashboard.shadowRoot?.querySelectorAll(".provider-row");
    expect(providers).toHaveLength(2);
    expect(providers?.[0].textContent).toContain("No shared credential");
    expect(providers?.[0].textContent).toContain("Configure the Vercel access token in server settings");
    expect(providers?.[1].textContent).toContain("Configure the Plausible Stats API key in server settings");
    expect(dashboard.shadowRoot?.textContent).not.toContain("WebAnalytics__Providers__");
    expect(dashboard.shadowRoot?.querySelector(".providers code")).toBeNull();
  });

  it("marks new connections as using the configured shared token", async () => {
    sdk.settings.mockResolvedValue(apiOk({
      enabled: true,
      providerTokens: [{ provider: "Vercel", hasAccessToken: true }, { provider: "Plausible", hasAccessToken: false }],
      canCreateMockConnections: false,
      defaultRangeDays: 30,
      cacheDuration: "00:05:00",
      connections: [],
    }));
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).not.toBeNull());

    const vercelProvider = dashboard.shadowRoot?.querySelectorAll(".provider-row")[0];
    expect(vercelProvider?.textContent).toContain("Shared credential detected");
    expect(vercelProvider?.querySelector("code")).toBeNull();
    dashboard.shadowRoot?.querySelector<HTMLElement>('.connection-empty-state [label="Choose analytics provider"]')?.click();
    await dashboard.updateComplete;
    dashboard.shadowRoot?.querySelector<HTMLElement>('.provider-choice[aria-label="Add Vercel connection"]')?.click();
    await dashboard.updateComplete;

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    expect(editor.connection.hasAccessToken).toBe(true);
    expect(editor.connection.hasAccessTokenOverride).toBe(false);
    expect(editor.shadowRoot?.querySelector(".summary-state uui-tag")?.textContent?.trim()).toBe("Setup required");
    expect(editor.shadowRoot?.querySelector(".summary-state small")?.textContent?.trim()).toBe("Shared credential");
  });

  it("prevents testing until both the identifier and server credential are available", async () => {
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [{ ...connection(), hasAccessToken: false }] })));
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    const testButton = editor.shadowRoot?.querySelector<HTMLElement>('[label="Add a server-side credential before testing this connection."]');
    expect(testButton?.hasAttribute("disabled")).toBe(true);
    expect(editor.shadowRoot?.querySelector(".summary-health uui-tag")?.textContent?.trim()).toBe("Setup required");
  });

  it("shows a recoverable message when the override setting name cannot be copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard unavailable")) },
    });
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection()] })));
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    editor.shadowRoot?.querySelector<HTMLElement>('[label="Copy credential setting name"]')?.click();

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".copy-feedback")?.textContent).toContain("Select and copy it manually"));
  });

  it("adds development mock scenarios as deterministic connections", async () => {
    sdk.settings.mockResolvedValue(apiOk({
      enabled: true,
      providerTokens: [{ provider: "Vercel", hasAccessToken: false }, { provider: "Plausible", hasAccessToken: false }],
      canCreateMockConnections: true,
      defaultRangeDays: 30,
      cacheDuration: "00:05:00",
      connections: [],
    }));
    const dashboard = document.createElement("vercel-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".mock-settings")).not.toBeNull());

    const buttons = dashboard.shadowRoot?.querySelectorAll<HTMLElement>(".mock-scenario uui-button");
    expect(buttons).toHaveLength(4);
    expect(buttons?.[0].getAttribute("label")).toBe("Add Demo mock connection");
    buttons?.[1].click();
    await dashboard.updateComplete;

    const editor = dashboard.shadowRoot?.querySelector("vercel-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    expect(editor.connection).toMatchObject({
      displayName: "Mock · UTM campaigns",
      projectId: "",
      hasAccessToken: false,
      mockScenario: "Utm",
    });
    expect(editor.shadowRoot?.querySelector(".summary-state uui-tag")?.textContent?.trim()).toBe("Ready");
    expect(editor.shadowRoot?.querySelector(".summary-state small")?.textContent?.trim()).toBe("Development mock");
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
