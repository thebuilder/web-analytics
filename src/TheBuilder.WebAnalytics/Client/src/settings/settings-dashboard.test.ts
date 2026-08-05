// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  settings: vi.fn(),
  saveSettings: vi.fn(),
  testConnection: vi.fn(),
}));
const notifications = vi.hoisted(() => ({
  peek: vi.fn(),
}));

vi.mock("../api/sdk.gen.js", () => ({ WebAnalyticsService: sdk }));
vi.mock("@umbraco-cms/backoffice/notification", () => ({ UMB_NOTIFICATION_CONTEXT: { TYPE: {} } }));
vi.mock("@umbraco-cms/backoffice/element-api", () => ({
  UmbElementMixin: <T extends CustomElementConstructor>(base: T) => class extends base {
    consumeContext(_token: unknown, callback: (context: typeof notifications) => void) {
      callback(notifications);
    }
  },
}));
vi.mock("@umbraco-cms/backoffice/style", () => ({ UmbTextStyles: [] }));
vi.mock("@umbraco-cms/backoffice/document", () => ({}));

import type { AnalyticsConnectionSettingsResponse, AnalyticsSettingsResponse } from "../api/types.gen.js";
import type { WebAnalyticsSettingsDashboardElement } from "./settings-dashboard.element.js";
import type { AnalyticsConnectionEditorElement } from "./connection-editor.element.js";
import "./settings-dashboard.element.js";

beforeEach(() => {
  sdk.settings.mockReset();
  sdk.saveSettings.mockReset();
  sdk.testConnection.mockReset();
  notifications.peek.mockReset();
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

    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".load-error")).not.toBeNull());
    expect(dashboard.shadowRoot?.querySelector("uui-box")?.getAttribute("headline")).toBe("Could not reach the settings service");
    expect(dashboard.shadowRoot?.textContent).toContain("Check your connection and that Umbraco is running");

    dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Retry loading settings"]')?.click();

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connections-section")).not.toBeNull());
    expect(sdk.settings).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "Sign in again", "session has expired"],
    [403, "Administrator access required", "Only administrators"],
    [404, "Package files are out of sync", "Restart Umbraco"],
    [503, "Settings service unavailable", "Umbraco logs"],
  ])("shows a specific recovery for HTTP %s", async (status, headline, message) => {
    sdk.settings.mockResolvedValueOnce(apiError(status));

    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".load-error")).not.toBeNull());
    expect(dashboard.shadowRoot?.querySelector("uui-box")?.getAttribute("headline")).toBe(headline);
    expect(dashboard.shadowRoot?.textContent).toContain(message);
  });

  it("shows the installed package version below the settings", async () => {
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".package-version")).not.toBeNull());
    expect(dashboard.shadowRoot?.querySelector(".package-version")?.textContent).toContain("Current installed version of Web Analytics: 0.3.0");
  });

  it.each([
    ["an SDK error result", () => sdk.testConnection.mockResolvedValueOnce(apiError()), "Umbraco logs"],
    ["a rejected request", () => sdk.testConnection.mockRejectedValueOnce(new Error("Network unavailable")), "could not reach Umbraco"],
  ])("shows a connection-local error and re-enables testing after %s", async (_description, arrangeResponse, message) => {
    arrangeResponse();
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection()] })));

    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    editor.dispatchEvent(new CustomEvent("test-connection", { bubbles: true, composed: true }));

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".action-status")?.textContent).toContain(message));
    expect(editor.testing).toBe(false);
    expect(editor.shadowRoot?.querySelector<HTMLElement>('[label="Test the saved connection."]')?.hasAttribute("disabled")).toBe(false);
  });

  it("promotes a successful connection test into the connection summary", async () => {
    sdk.testConnection.mockResolvedValueOnce(apiOk({ success: true, message: "Connection successful." }));
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection()] })));
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    editor.dispatchEvent(new CustomEvent("test-connection", { bubbles: true, composed: true }));

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".summary-health uui-tag")?.textContent?.trim()).toBe("Connected"));
    expect(editor.shadowRoot?.querySelector(".action-status")?.textContent).toContain("Connection successful.");
  });

  it("keeps edits dirty after a rejected save and allows a later save to succeed", async () => {
    sdk.saveSettings.mockRejectedValueOnce(new Error("Network unavailable"));

    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("#default-range")).not.toBeNull());

    const input = dashboard.shadowRoot?.querySelector<HTMLInputElement>("#default-range");
    input!.value = "31";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await dashboard.updateComplete;

    const form = dashboard.shadowRoot?.querySelector("form");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true, composed: true }));

    await vi.waitFor(() => expect(dashboard.shadowRoot?.textContent).toContain("could not reach Umbraco"));
    expect(dashboard.shadowRoot?.querySelector(".save-status")?.textContent).toContain("Unsaved changes");
    expect(input!.value).toBe("31");
    expect(dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Save Web Analytics settings"]')?.hasAttribute("disabled")).toBe(false);

    sdk.saveSettings.mockResolvedValueOnce(apiOk(settings({ defaultRangeDays: 31 })));
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true, composed: true }));

    await vi.waitFor(() => expect(notifications.peek).toHaveBeenCalledWith("positive", {
      data: { message: "Web Analytics settings saved." },
    }));
    expect(dashboard.shadowRoot?.querySelector(".settings-actions")).not.toBeNull();
    expect(dashboard.shadowRoot?.querySelector(".save-status")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Save Web Analytics settings"]')?.hasAttribute("disabled")).toBe(true);
    expect(dashboard.shadowRoot?.querySelector(".status")).toBeNull();
    expect(sdk.saveSettings).toHaveBeenCalledTimes(2);
  });

  it("shows the same save error for an SDK error result", async () => {
    sdk.saveSettings.mockResolvedValueOnce(apiError());

    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("#default-range")).not.toBeNull());

    const input = dashboard.shadowRoot?.querySelector<HTMLInputElement>("#default-range");
    input!.value = "31";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await dashboard.updateComplete;
    dashboard.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true, composed: true }));

    await vi.waitFor(() => expect(dashboard.shadowRoot?.textContent).toContain("could not be completed"));
    expect(dashboard.shadowRoot?.querySelector(".save-status")?.textContent).toContain("Unsaved changes");
    expect(input!.value).toBe("31");
  });

  it.each([
    [401, "session has expired"],
    [404, "server and package files use the same version"],
    [503, "Umbraco logs"],
  ])("preserves edits and explains save HTTP %s failures", async (status, message) => {
    sdk.saveSettings.mockResolvedValueOnce(apiError(status));

    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("#default-range")).not.toBeNull());
    const input = dashboard.shadowRoot?.querySelector<HTMLInputElement>("#default-range");
    input!.value = "31";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    dashboard.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true, composed: true }));

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".status")?.textContent).toContain(message));
    expect(dashboard.shadowRoot?.querySelector(".save-status")?.textContent).toContain("Unsaved changes");
    expect(input!.value).toBe("31");
  });

  it.each([
    [401, "session has expired"],
    [404, "connection test API was not found"],
    [503, "Umbraco logs"],
  ])("explains connection-test HTTP %s failures", async (status, message) => {
    sdk.testConnection.mockResolvedValueOnce(apiError(status));
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection()] })));

    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-connection-editor")).not.toBeNull());
    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    editor.dispatchEvent(new CustomEvent("test-connection", { bubbles: true, composed: true }));

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".action-status")?.textContent).toContain(message));
    expect(editor.testing).toBe(false);
  });
});

function settings(overrides: Partial<AnalyticsSettingsResponse> = {}): AnalyticsSettingsResponse {
  return {
    packageVersion: "0.3.0",
    enabled: true,
    providerTokens: [{ provider: "Vercel", hasAccessToken: false }, { provider: "Plausible", hasAccessToken: false }],
    canCreateMockConnections: false,
    defaultRangeDays: 30,
    cacheDuration: "00:05:00",
    connections: [],
    ...overrides,
    providers: overrides.providers ?? PROVIDERS,
  };
}

const PROVIDERS: AnalyticsSettingsResponse["providers"] = [
  {
    provider: "Vercel",
    description: "Projects using Vercel Web Analytics",
    logoSlug: "vercel",
    capabilities: { dimensions: ["RequestPath", "EventName"], events: true, eventDetails: true, eventProperties: false, globalEventFiltering: false, globalEventPropertyFiltering: false, flags: true, breakdownOrdering: false },
    identifier: { key: "projectId", label: "Vercel project ID", description: "Use the project ID from your Vercel project settings.", requiredMessage: "a Vercel project ID" },
    team: { key: "team", label: "Team ID or slug", description: "Optional team slug or ID for projects owned by a Vercel team." },
    credential: { label: "access token", description: "Configure a Vercel access token in the server settings.", documentationUrl: "https://vercel.com/docs/rest-api" },
    eventProperties: null,
  },
  {
    provider: "Plausible",
    description: "Sites using Plausible Analytics",
    logoSlug: "plausible",
    capabilities: { dimensions: ["RequestPath", "EventName"], events: true, eventDetails: true, eventProperties: true, globalEventFiltering: true, globalEventPropertyFiltering: true, flags: false, breakdownOrdering: true },
    identifier: { key: "siteId", label: "Plausible site ID", description: "Use the domain configured in your Plausible site settings.", requiredMessage: "a Plausible site ID" },
    team: null,
    credential: { label: "Stats API key", description: "Configure a Plausible Stats API key in the server settings.", documentationUrl: "https://plausible.io/docs/stats-api" },
    eventProperties: { label: "event properties", description: "Optional custom event property names configured for this Plausible site.", maximumNames: 20, maximumNameLength: 100 },
  },
];

function connection(): AnalyticsConnectionSettingsResponse {
  return {
    key: "connection-1",
    displayName: "Example project",
    provider: "Vercel",
    projectId: "prj_example",
    team: null,
    siteId: "",
    eventPropertyNames: [],
    enableEvents: true,
    enableFlags: true,
    documentRootKeys: [],
    enableAllDocumentTypes: false,
    enabledDocumentTypeKeys: [],
    hasAccessToken: true,
    hasAccessTokenOverride: false,
    mockScenario: null,
  };
}

describe("analytics settings onboarding", () => {
  it("orders connection settings by the editor workflow without reserving an empty status row", async () => {
    const plausible = {
      ...connection(),
      key: "connection-2",
      provider: "Plausible" as const,
      projectId: "",
      siteId: "example.com",
    };
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection(), plausible] })));
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelectorAll("web-analytics-connection-editor")).toHaveLength(2));
    const editors = [...dashboard.shadowRoot?.querySelectorAll("web-analytics-connection-editor") ?? []] as AnalyticsConnectionEditorElement[];
    const sectionLabels = (editor: AnalyticsConnectionEditorElement) =>
      [...editor.shadowRoot?.querySelectorAll(".config-section > summary > span") ?? []].map((label) => label.textContent?.trim());

    expect(editors[0].shadowRoot?.querySelector(".action-status")).toBeNull();
    expect(sectionLabels(editors[0])).toEqual([
      "Page analytics",
      "Document workspace",
      "Dashboard reports",
      "Credential override",
    ]);
    expect(sectionLabels(editors[1])).toEqual([
      "Page analytics",
      "Document workspace",
      "Dashboard reports",
      "Event properties",
      "Credential override",
    ]);
  });

  it("renders only the dashboard reports supported by each connection provider", async () => {
    const plausible = {
      ...connection(),
      key: "connection-2",
      provider: "Plausible" as const,
      projectId: "",
      siteId: "example.com",
    };
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection(), plausible] })));
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);

    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelectorAll("web-analytics-connection-editor")).toHaveLength(2));
    const editors = [...dashboard.shadowRoot?.querySelectorAll("web-analytics-connection-editor") ?? []] as AnalyticsConnectionEditorElement[];
    expect(editors[0].shadowRoot?.querySelector('[label="Show custom events"]')).not.toBeNull();
    expect(editors[0].shadowRoot?.querySelector('[label="Show feature flags"]')).not.toBeNull();
    expect(editors[1].shadowRoot?.querySelector('[label="Show custom events"]')).not.toBeNull();
    expect(editors[1].shadowRoot?.querySelector('[label="Show feature flags"]')).toBeNull();
  });

  it("emits connection changes when a dashboard report is disabled", async () => {
    const editor = document.createElement("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    editor.connection = connection();
    editor.descriptor = PROVIDERS[0];
    const changed = vi.fn();
    editor.addEventListener("connection-change", changed);
    document.body.append(editor);
    await editor.updateComplete;

    const events = editor.shadowRoot?.querySelector<HTMLElement & { checked: boolean }>('[label="Show custom events"]');
    events!.checked = false;
    events!.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

    expect((changed.mock.calls[0][0] as CustomEvent<AnalyticsConnectionSettingsResponse>).detail.enableEvents).toBe(false);
  });

  it("shows an unsupported connection and blocks saving when its descriptor is missing", async () => {
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ providers: [], connections: [connection()] })));
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-connection-editor")?.shadowRoot?.querySelector(".unsupported-provider") ?? null).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    expect(editor.shadowRoot?.textContent ?? "").toContain("Unsupported analytics provider: Vercel.");
    dashboard.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true, composed: true }));
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".status")?.textContent).toContain("Unsupported analytics provider: Vercel."));
    expect(sdk.saveSettings).not.toHaveBeenCalled();
  });

  it("guides the first connection without rendering an empty default selector", async () => {
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).not.toBeNull());

    expect(dashboard.shadowRoot?.querySelector("#default-connection")).toBeNull();
    expect(dashboard.shadowRoot?.querySelector("h1")).toBeNull();
    expect(dashboard.shadowRoot?.textContent).not.toContain("Connect analytics providers and choose where page analytics appears.");
    expect(dashboard.shadowRoot?.querySelector(".settings-actions")?.tagName).toBe("UMB-FOOTER-LAYOUT");
    expect(dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Save Web Analytics settings"]')?.getAttribute("color")).toBe("positive");
    expect(dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Save Web Analytics settings"]')?.hasAttribute("disabled")).toBe(true);
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
    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor");
    expect(editor).not.toBeNull();
    const generatedKey = (editor as AnalyticsConnectionEditorElement).connection.key;
    expect(generatedKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Array.from(editor?.shadowRoot?.querySelectorAll(".token-key code") ?? []).map((element) => element.textContent))
      .toEqual([
        "WebAnalytics__Providers__Vercel__AccessToken",
        `WebAnalytics__ConnectionAccessTokens__${generatedKey}`,
      ]);
    expect(dashboard.shadowRoot?.querySelector(".save-status")?.textContent?.trim()).toContain("Unsaved changes");
    expect(dashboard.shadowRoot?.querySelector<HTMLElement>('[label="Save Web Analytics settings"]')?.hasAttribute("disabled")).toBe(false);
    expect(dashboard.shadowRoot?.querySelectorAll('[label="Save Web Analytics settings"]')).toHaveLength(1);
    expect(Array.from(editor?.shadowRoot?.querySelectorAll(".essentials uui-input") ?? []).map((input) => input.getAttribute("name"))).toEqual([
      "projectId",
      "teamReference",
    ]);
    dashboard.shadowRoot?.querySelector<HTMLElement>('.section-heading [label="Add analytics connection"]')?.click();
    await dashboard.updateComplete;
    dashboard.shadowRoot?.querySelector<HTMLElement>('.provider-choice[aria-label="Add Plausible connection"]')?.click();
    await dashboard.updateComplete;

    const editors = dashboard.shadowRoot?.querySelectorAll("web-analytics-connection-editor");
    expect((editors?.[1] as AnalyticsConnectionEditorElement).connection.key).not.toBe(
      (editors?.[0] as AnalyticsConnectionEditorElement).connection.key,
    );
    expect((editors?.[1] as AnalyticsConnectionEditorElement).connection.provider).toBe("Plausible");
  });

  it("shows provider readiness in the connection picker without exposing server configuration keys", async () => {
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).not.toBeNull());
    dashboard.shadowRoot?.querySelector<HTMLElement>('.connection-empty-state [label="Choose analytics provider"]')?.click();
    await dashboard.updateComplete;

    const providers = dashboard.shadowRoot?.querySelectorAll(".provider-choice");
    expect(providers).toHaveLength(2);
    expect(providers?.[0].textContent).toContain("No shared credential detected");
    expect(providers?.[1].textContent).toContain("No shared credential detected");
    expect(dashboard.shadowRoot?.textContent).not.toContain("WebAnalytics__Providers__");
    expect(dashboard.shadowRoot?.querySelector(".providers")).toBeNull();
  });

  it("marks new connections as using the configured shared token", async () => {
    sdk.settings.mockResolvedValue(apiOk({
      packageVersion: "0.3.0",
      enabled: true,
      providers: PROVIDERS,
      providerTokens: [{ provider: "Vercel", hasAccessToken: true }, { provider: "Plausible", hasAccessToken: false }],
      canCreateMockConnections: false,
      defaultRangeDays: 30,
      cacheDuration: "00:05:00",
      connections: [],
    }));
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".connection-empty-state")).not.toBeNull());

    dashboard.shadowRoot?.querySelector<HTMLElement>('.connection-empty-state [label="Choose analytics provider"]')?.click();
    await dashboard.updateComplete;
    const vercelProvider = dashboard.shadowRoot?.querySelectorAll(".provider-choice")[0];
    expect(vercelProvider?.textContent).toContain("Shared credential detected");
    expect(vercelProvider?.querySelector("code")).toBeNull();
    dashboard.shadowRoot?.querySelector<HTMLElement>('.provider-choice[aria-label="Add Vercel connection"]')?.click();
    await dashboard.updateComplete;

    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    expect(editor.connection.hasAccessToken).toBe(true);
    expect(editor.connection.hasAccessTokenOverride).toBe(false);
    expect(editor.shadowRoot?.querySelector(".summary-state uui-tag")?.textContent?.trim()).toBe("Setup required");
    expect(editor.shadowRoot?.querySelector(".summary-state small")?.textContent?.trim()).toBe("Shared credential");
  });

  it("prevents testing until both the identifier and server credential are available", async () => {
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [{ ...connection(), hasAccessToken: false }] })));
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    const testButton = editor.shadowRoot?.querySelector<HTMLElement>('[label="Add a server-side credential before testing this connection."]');
    expect(testButton?.hasAttribute("disabled")).toBe(true);
    expect(editor.shadowRoot?.querySelector(".summary-health uui-tag")?.textContent?.trim()).toBe("Setup required");
    expect([...editor.shadowRoot?.querySelectorAll(".config-section > summary > span") ?? []].map((label) => label.textContent?.trim())).toEqual([
      "Connection credential",
      "Page analytics",
      "Document workspace",
      "Dashboard reports",
    ]);
    expect(editor.shadowRoot?.querySelector(".token-section small")?.textContent?.trim()).toBe("Required before testing");
    expect(Array.from(editor.shadowRoot?.querySelectorAll(".credential-setting-label") ?? []).map((element) => element.textContent?.trim())).toEqual([
      "Shared credential",
      "Connection-specific credential",
    ]);
    expect(Array.from(editor.shadowRoot?.querySelectorAll(".token-key code") ?? []).map((element) => element.textContent)).toEqual([
      "WebAnalytics__Providers__Vercel__AccessToken",
      "WebAnalytics__ConnectionAccessTokens__connection-1",
    ]);
  });

  it("shows a recoverable message when the override setting name cannot be copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard unavailable")) },
    });
    sdk.settings.mockResolvedValueOnce(apiOk(settings({ connections: [connection()] })));
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector("web-analytics-connection-editor")).not.toBeNull());

    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
    editor.shadowRoot?.querySelector<HTMLElement>('[label="Copy connection credential setting name"]')?.click();

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".copy-feedback")?.textContent).toContain("Select and copy it manually"));
  });

  it("adds development mock scenarios as deterministic connections", async () => {
    sdk.settings.mockResolvedValue(apiOk({
      packageVersion: "0.3.0",
      enabled: true,
      providers: PROVIDERS,
      providerTokens: [{ provider: "Vercel", hasAccessToken: false }, { provider: "Plausible", hasAccessToken: false }],
      canCreateMockConnections: true,
      defaultRangeDays: 30,
      cacheDuration: "00:05:00",
      connections: [],
    }));
    const dashboard = document.createElement("web-analytics-settings-dashboard") as WebAnalyticsSettingsDashboardElement;
    document.body.append(dashboard);
    await vi.waitFor(() => expect(dashboard.shadowRoot?.querySelector(".mock-settings")).not.toBeNull());

    const buttons = dashboard.shadowRoot?.querySelectorAll<HTMLElement>(".mock-scenario uui-button");
    expect(buttons).toHaveLength(4);
    expect(buttons?.[0].getAttribute("label")).toBe("Add Demo mock connection");
    buttons?.[1].click();
    await dashboard.updateComplete;

    const editor = dashboard.shadowRoot?.querySelector("web-analytics-connection-editor") as AnalyticsConnectionEditorElement;
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

function apiError(status = 500) {
  return { data: undefined, error: { message: "Request failed" }, request: new Request("https://example.com"), response: new Response(null, { status }) };
}
