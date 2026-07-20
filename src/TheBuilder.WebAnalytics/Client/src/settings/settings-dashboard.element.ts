import {
  LitElement,
  css,
  customElement,
  html,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { UUIInputElement, UUIToggleElement } from "@umbraco-cms/backoffice/external/uui";
import { WebAnalyticsService } from "../api/sdk.gen.js";
import type {
  AnalyticsConnectionSettingsResponse,
  AnalyticsProvider,
  AnalyticsSettingsResponse,
  UpdateAnalyticsSettingsRequest,
} from "../api/types.gen.js";
import "./connection-editor.element.js";
import type { ConnectionActionStatus, AnalyticsConnectionEditorElement } from "./connection-editor.element.js";
import { createSettingsUpdate, validateConnection, validateEditableSettings } from "./settings-model.js";
import { announceAnalyticsAvailability } from "../section/analytics-availability.js";
import { MOCK_SCENARIOS, type MockScenarioDefinition } from "./mock-scenarios.js";

type NewConnection =
  | { kind: "provider"; provider: AnalyticsProvider; hasAccessToken: boolean }
  | { kind: "mock"; scenario: MockScenarioDefinition };

@customElement("vercel-analytics-settings-dashboard")
export class WebAnalyticsSettingsDashboardElement extends UmbElementMixin(LitElement) {
  @state() private _settings?: AnalyticsSettingsResponse;
  @state() private _loading = true;
  @state() private _saving = false;
  @state() private _dirty = false;
  @state() private _showValidation = false;
  @state() private _testingKey?: string;
  @state() private _status?: { type: "success" | "error"; message: string };
  @state() private _connectionStatuses: Record<string, ConnectionActionStatus> = {};
  @state() private _copiedTokenProvider?: AnalyticsProvider;
  private _copyStatusTimer?: number;

  connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }

  disconnectedCallback(): void {
    window.clearTimeout(this._copyStatusTimer);
    super.disconnectedCallback();
  }

  async #load(): Promise<void> {
    this._loading = true;
    try {
      const { data, error } = await WebAnalyticsService.settings();
      if (error || !data) {
        this._status = { type: "error", message: "Analytics settings could not be loaded. Administrator access is required." };
        return;
      }
      this._settings = data;
      this._dirty = false;
      this._showValidation = false;
      this._status = undefined;
    } catch {
      this._status = { type: "error", message: "Analytics settings could not be loaded. Administrator access is required." };
    } finally {
      this._loading = false;
    }
  }

  #patch(patch: Partial<AnalyticsSettingsResponse>, markDirty = true): void {
    if (!this._settings) return;
    this._settings = { ...this._settings, ...patch };
    if (markDirty) {
      this._dirty = true;
      if (this._status?.type === "success") this._status = undefined;
    }
  }

  #updateConnection(index: number, connection: AnalyticsConnectionSettingsResponse): void {
    if (!this._settings) return;
    const connections = this._settings.connections.map((item, itemIndex) => itemIndex === index ? connection : item);
    this.#patch({ connections });
  }

  #addConnection(provider: AnalyticsProvider): void {
    const hasAccessToken = this._settings?.providerTokens.some((item) => item.provider === provider && item.hasAccessToken) ?? false;
    this.#appendConnection({ kind: "provider", provider, hasAccessToken });
  }

  #addMockConnection(scenario: MockScenarioDefinition): void {
    this.#appendConnection({ kind: "mock", scenario });
  }

  #appendConnection(details: NewConnection): void {
    if (!this._settings) return;
    const isMock = details.kind === "mock";
    const provider = isMock ? "Vercel" : details.provider;
    const key = crypto.randomUUID();
    const connection: AnalyticsConnectionSettingsResponse = {
      key,
      displayName: isMock ? details.scenario.displayName : "",
      provider,
      projectId: "",
      team: null,
      siteId: "",
      documentRootKeys: [],
      enableAllDocumentTypes: false,
      enabledDocumentTypeKeys: [],
      hasAccessToken: isMock ? false : details.hasAccessToken,
      hasAccessTokenOverride: false,
      mockScenario: isMock ? details.scenario.id : null,
    };
    const connections = [...this._settings.connections, connection];
    this.#patch({ connections });
    this.updateComplete.then(() => {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      this.shadowRoot?.querySelector<HTMLElement>("vercel-analytics-connection-editor:last-of-type")?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  async #copyTokenKey(provider: AnalyticsProvider): Promise<void> {
    await navigator.clipboard.writeText(`WebAnalytics__Providers__${provider}__AccessToken`);
    window.clearTimeout(this._copyStatusTimer);
    this._copiedTokenProvider = provider;
    this._copyStatusTimer = window.setTimeout(() => { this._copiedTokenProvider = undefined; }, 2000);
  }

  #removeConnection(index: number): void {
    if (!this._settings) return;
    const connection = this._settings.connections[index];
    if (!window.confirm(`Remove “${connection.displayName || connection.siteId || connection.projectId || "this connection"}”? This takes effect when settings are saved.`)) return;
    const connections = this._settings.connections.filter((_, itemIndex) => itemIndex !== index);
    this.#patch({ connections });
  }

  async #testConnection(key: string): Promise<void> {
    if (this._dirty) {
      this._connectionStatuses = { ...this._connectionStatuses, [key]: { type: "error", message: "Save changes before testing this connection." } };
      return;
    }
    this._testingKey = key;
    this._connectionStatuses = { ...this._connectionStatuses, [key]: { type: "info", message: "Testing the saved connection…" } };
    try {
      const { data, error } = await WebAnalyticsService.testConnection({ path: { key } });
      this._connectionStatuses = {
        ...this._connectionStatuses,
        [key]: error || !data
          ? { type: "error", message: "The connection test could not be completed." }
          : { type: data.success ? "success" : "error", message: data.message },
      };
    } catch {
      this._connectionStatuses = {
        ...this._connectionStatuses,
        [key]: { type: "error", message: "The connection test could not be completed." },
      };
    } finally {
      this._testingKey = undefined;
    }
  }

  async #save(event?: Event): Promise<void> {
    event?.preventDefault();
    await this.#persistSettings("Web Analytics settings saved.");
  }

  async #persistSettings(successMessage?: string): Promise<boolean> {
    if (!this._settings || this._saving) return false;
    this._showValidation = true;
    const validationMessage = validateEditableSettings(this._settings);
    if (validationMessage) {
      this._status = { type: "error", message: validationMessage };
      await this.updateComplete;
      this.#focusFirstInvalid();
      return false;
    }

    this._saving = true;
    this._status = undefined;
    const body: UpdateAnalyticsSettingsRequest = createSettingsUpdate(this._settings);
    try {
      const { data, error } = await WebAnalyticsService.saveSettings({ body });
      if (error || !data) {
        this._status = { type: "error", message: "Settings were not saved. Check the connection fields and mapping values." };
        return false;
      }
      this._settings = data;
      this._dirty = false;
      this._showValidation = false;
      announceAnalyticsAvailability(data.enabled);
      if (successMessage) this._status = { type: "success", message: successMessage };
      return true;
    } catch {
      this._status = { type: "error", message: "Settings were not saved. Check the connection fields and mapping values." };
      return false;
    } finally {
      this._saving = false;
    }
  }

  #focusFirstInvalid(): void {
    const editors = this.shadowRoot?.querySelectorAll<AnalyticsConnectionEditorElement>("vercel-analytics-connection-editor") ?? [];
    for (const editor of editors) {
      if (editor.focusFirstInvalid()) return;
    }
  }

  render() {
    if (this._loading) return html`<uui-loader-bar aria-label="Loading analytics settings"></uui-loader-bar>`;
    if (!this._settings) return html`
      <umb-empty-state headline="Settings unavailable"><p>${this._status?.message}</p><uui-button look="secondary" label="Retry loading settings" @click=${this.#load}>Retry</uui-button></umb-empty-state>
    `;

    const hasConnections = this._settings.connections.length > 0;
    const mockConnectionsEnabled = this._settings.canCreateMockConnections;

    return html`
      <form @submit=${this.#save} novalidate>
        <header>
          <div class="page-heading"><h1>Web Analytics</h1><p>Connect analytics providers and choose where page analytics appears.</p></div>
        </header>

        ${this._dirty ? html`
          <div class="save-bar" aria-label="Unsaved Web Analytics settings">
            <span class="unsaved-indicator" role="status" aria-live="polite">Unsaved changes</span>
            <uui-button type="submit" look="primary" label="Save Web Analytics settings" .state=${this._saving ? "waiting" : undefined} ?disabled=${this._saving}>Save settings</uui-button>
          </div>
        ` : ""}

        ${this._status ? html`<div class=${`status ${this._status.type}`} role=${this._status.type === "error" ? "alert" : "status"} aria-live="polite"><uui-icon name=${this._status.type === "success" ? "icon-check" : "icon-alert"}></uui-icon><span>${this._status.message}</span></div>` : ""}

        <uui-box headline="Defaults" class="general">
          <div class="general-grid">
            <uui-form-layout-item class="package-status">
              <uui-label slot="label">Package status</uui-label>
              <uui-toggle
                label="Enable Web Analytics"
                ?checked=${this._settings.enabled}
                @change=${(event: Event) => this.#patch({ enabled: (event.target as UUIToggleElement).checked })}>
                Enable Web Analytics
              </uui-toggle>
            </uui-form-layout-item>
            <uui-form-layout-item>
              <uui-label slot="label" for="default-range">Default range in days</uui-label>
              <uui-input
                id="default-range"
                type="number"
                min="1"
                max="730"
                label="Default range in days"
                .value=${String(this._settings.defaultRangeDays)}
                @input=${(event: Event) => this.#patch({ defaultRangeDays: Number((event.target as UUIInputElement).value) })}></uui-input>
            </uui-form-layout-item>
            <uui-form-layout-item>
              <uui-label slot="label" for="cache-duration">Cache duration</uui-label>
              <div class="field-with-help">
                <uui-input
                  id="cache-duration"
                  label="Cache duration"
                  aria-describedby="cache-duration-help"
                  .value=${this._settings.cacheDuration}
                  @input=${(event: Event) => this.#patch({ cacheDuration: String((event.target as UUIInputElement).value) })}></uui-input>
                <span id="cache-duration-help" class="field-help">Use <code>hh:mm:ss</code>, for example <code>00:05:00</code>.</span>
              </div>
            </uui-form-layout-item>
            ${this._settings.providerTokens.map((token) => html`
              <section class="shared-token" aria-labelledby=${`shared-token-${token.provider}`}>
                <div class="shared-token-summary">
                  <strong id=${`shared-token-${token.provider}`}>${token.provider} access token</strong>
                  ${token.hasAccessToken
                    ? html`<span class="shared-token-status configured"><uui-icon name="icon-check" aria-hidden="true"></uui-icon>Configured</span>`
                    : html`<uui-tag class="shared-token-status" color="warning">Not configured</uui-tag>`}
                </div>
                ${token.hasAccessToken ? "" : html`
                  <div class="shared-token-setup">
                    <p class="shared-token-help">Set this server environment variable to a ${token.provider} access token.</p>
                    <div class="shared-token-key">
                      <code>WebAnalytics__Providers__${token.provider}__AccessToken</code>
                      <uui-button compact look="secondary" label=${`Copy ${token.provider} access token setting name`} @click=${() => this.#copyTokenKey(token.provider)}>${this._copiedTokenProvider === token.provider ? "Copied" : "Copy"}</uui-button>
                    </div>
                  </div>
                `}
              </section>
            `)}
          </div>
        </uui-box>

        ${this._settings.canCreateMockConnections ? html`
          <uui-box headline="Development data" class="mock-settings">
            <p class="mock-intro">Create deterministic local connections to verify dashboard states without calling Vercel. Mock connections are only active while the server runs in Development.</p>
            <div class="mock-scenarios">
              ${MOCK_SCENARIOS.map((scenario) => {
                const added = this._settings?.connections.some((connection) => connection.mockScenario === scenario.id) ?? false;
                return html`
                  <div class="mock-scenario">
                    <span><strong>${scenario.name}</strong><small>${scenario.description}</small></span>
                    <uui-button
                      type="button"
                      look="secondary"
                      label=${added ? `${scenario.name} mock connection added` : `Add ${scenario.name} mock connection`}
                      ?disabled=${added}
                      @click=${() => this.#addMockConnection(scenario)}>${added ? "Added" : "Add mock"}</uui-button>
                  </div>
                `;
              })}
            </div>
          </uui-box>
        ` : ""}

        <section aria-labelledby="connections-heading">
          <div class="section-heading">
            <div><h2 id="connections-heading">Connections</h2><p>Add each analytics site or project that editors should be able to view.</p></div>
            <div class="connection-actions">
              <uui-button type="button" look="secondary" label="Add Vercel connection" @click=${() => this.#addConnection("Vercel")}>Add Vercel</uui-button>
              <uui-button type="button" look="secondary" label="Add Plausible connection" @click=${() => this.#addConnection("Plausible")}>Add Plausible</uui-button>
            </div>
          </div>
          <div class="connections">
            ${this._settings.connections.map((connection, index) => html`
              <vercel-analytics-connection-editor
                .connection=${connection}
                .errors=${this._showValidation ? validateConnection(connection) : {}}
                .status=${this._connectionStatuses[connection.key]}
                ?mockConnectionsEnabled=${mockConnectionsEnabled}
                ?dirty=${this._dirty}
                ?testing=${this._testingKey === connection.key}
                @connection-change=${(event: CustomEvent<AnalyticsConnectionSettingsResponse>) => this.#updateConnection(index, event.detail)}
                @remove-connection=${() => this.#removeConnection(index)}
                @test-connection=${() => this.#testConnection(connection.key)}></vercel-analytics-connection-editor>
            `)}
            ${!hasConnections ? html`
              <div class="connection-empty-state">
                <uui-icon name="icon-globe" aria-hidden="true"></uui-icon>
                <div>
                  <h3>Connect your first analytics provider</h3>
                  <p>Choose Vercel or Plausible. The matching server-side access token above will be used automatically.</p>
                </div>
                <div class="connection-actions"><uui-button type="button" look="primary" label="Add your first Vercel connection" @click=${() => this.#addConnection("Vercel")}>Add Vercel</uui-button><uui-button type="button" look="secondary" label="Add your first Plausible connection" @click=${() => this.#addConnection("Plausible")}>Add Plausible</uui-button></div>
              </div>
            ` : ""}
          </div>
        </section>

      </form>
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { --analytics-z-sticky-action: 10; display: block; }
    form { max-width: 76rem; margin-inline: auto; padding: var(--uui-size-layout-1); }
    header, .section-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--uui-size-layout-1); }
    .page-heading, .section-heading > div { min-inline-size: 0; }
    .save-bar {
      align-items: center;
      background: var(--uui-color-surface);
      border: 1px solid var(--uui-color-border);
      display: flex;
      flex-wrap: wrap;
      gap: var(--uui-size-space-4);
      justify-content: flex-end;
      margin-block-start: var(--uui-size-space-5);
      padding: var(--uui-size-space-3) var(--uui-size-space-4);
      position: sticky;
      top: var(--uui-size-space-4);
      z-index: var(--analytics-z-sticky-action);
    }
    .unsaved-indicator { align-items: center; color: var(--uui-color-text-alt); display: inline-flex; font-size: var(--uui-type-small-size); gap: var(--uui-size-space-2); white-space: nowrap; }
    .unsaved-indicator::before { background: var(--uui-color-warning-standalone); border-radius: 50%; block-size: var(--uui-size-space-3); content: ""; flex: 0 0 auto; inline-size: var(--uui-size-space-3); }
    h1, h2 { margin: 0; }
    header p, .section-heading p { color: var(--uui-color-text-alt); margin-block: var(--uui-size-space-2) 0; text-wrap: pretty; }
    .status { align-items: flex-start; border: 1px solid var(--uui-color-border); display: flex; gap: var(--uui-size-space-2); margin-block: var(--uui-size-space-5); overflow-wrap: anywhere; padding: var(--uui-size-space-3) var(--uui-size-space-4); }
    .status.success { background: color-mix(in srgb, var(--uui-color-positive) 8%, var(--uui-color-surface)); border-color: color-mix(in srgb, var(--uui-color-positive) 35%, var(--uui-color-border)); }
    .status.error { background: color-mix(in srgb, var(--uui-color-danger) 7%, var(--uui-color-surface)); border-color: color-mix(in srgb, var(--uui-color-danger) 35%, var(--uui-color-border)); }
    .general { container-type: inline-size; margin-block: var(--uui-size-space-6) var(--uui-size-layout-2); }
    .mock-settings { margin-block-end: var(--uui-size-layout-2); }
    .mock-intro { color: var(--uui-color-text-alt); margin: 0 0 var(--uui-size-space-5); max-inline-size: 72ch; text-wrap: pretty; }
    .mock-scenarios { display: grid; gap: var(--uui-size-space-3); grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .mock-scenario { align-items: center; border: 1px solid var(--uui-color-border); display: grid; gap: var(--uui-size-space-4); grid-template-columns: minmax(0, 1fr) max-content; min-inline-size: 0; padding: var(--uui-size-space-4); }
    .mock-scenario > span { display: grid; gap: var(--uui-size-space-1); min-inline-size: 0; }
    .mock-scenario small { color: var(--uui-color-text-alt); text-wrap: pretty; }
    .mock-scenario uui-button { white-space: nowrap; }
    .general-grid { align-items: start; display: grid; gap: var(--uui-size-space-5) var(--uui-size-space-6); grid-template-columns: minmax(14rem, 1.35fr) minmax(10rem, 0.7fr) minmax(14rem, 1fr); }
    .general-grid > uui-form-layout-item { margin-block: 0; }
    .field-with-help { display: grid; gap: var(--uui-size-space-1); }
    .field-help { color: var(--uui-color-text-alt); font-size: var(--uui-type-small-size); }
    .package-status { min-inline-size: 0; }
    .shared-token { align-items: start; border-top: 1px solid var(--uui-color-border); display: grid; gap: var(--uui-size-space-3); grid-column: 1 / -1; min-inline-size: 0; padding-block-start: var(--uui-size-space-4); }
    .shared-token-summary { align-items: center; display: flex; flex-wrap: wrap; gap: var(--uui-size-space-2); }
    .shared-token-setup { display: grid; gap: var(--uui-size-space-4); max-inline-size: 42rem; min-inline-size: 0; }
    .shared-token-guidance { display: grid; gap: var(--uui-size-space-2); justify-items: start; }
    .shared-token-help { color: var(--uui-color-text-alt); margin: 0; max-inline-size: 48ch; text-wrap: pretty; }
    .shared-token-status.configured { align-items: center; color: var(--uui-color-positive); display: inline-flex; gap: var(--uui-size-space-1); }
    .shared-token-key { align-items: center; background: var(--uui-color-surface-alt); display: flex; gap: var(--uui-size-space-2); max-inline-size: 100%; padding: var(--uui-size-space-2) var(--uui-size-space-3); }
    .shared-token-key code { min-inline-size: 0; overflow-wrap: anywhere; }
    .shared-token-guidance > a { align-items: center; color: var(--uui-color-interactive); display: inline-flex; gap: var(--uui-size-space-1); white-space: nowrap; }
    .shared-token-guidance > a uui-icon { font-size: 0.875em; }
    .visually-hidden { block-size: 1px; clip: rect(0 0 0 0); clip-path: inset(50%); inline-size: 1px; overflow: hidden; position: absolute; white-space: nowrap; }
    .section-heading { margin-bottom: var(--uui-size-space-4); }
    .connections { display: grid; gap: var(--uui-size-layout-1); }
    .connection-empty-state {
      align-items: center;
      background: color-mix(in srgb, var(--uui-color-interactive) 5%, var(--uui-color-surface));
      border: 1px solid color-mix(in srgb, var(--uui-color-interactive) 22%, var(--uui-color-border));
      display: grid;
      gap: var(--uui-size-space-4);
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding: var(--uui-size-layout-1);
    }
    .connection-empty-state > uui-icon { color: var(--uui-color-interactive); font-size: var(--uui-size-8); }
    .connection-empty-state h3 { font-size: var(--uui-type-h5-size); margin: 0; text-wrap: balance; }
    .connection-empty-state p { color: var(--uui-color-text-alt); margin: var(--uui-size-space-1) 0 0; max-width: 65ch; text-wrap: pretty; }
    code { font-family: var(--uui-font-monospace); }
    @container (max-width: 52rem) {
      .general-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .package-status { grid-column: 1 / -1; }
    }
    @container (max-width: 34rem) {
      .general-grid { grid-template-columns: 1fr; }
      .package-status { grid-column: auto; }
      .shared-token { grid-column: auto; }
      .shared-token-key { justify-content: space-between; }
    }
    @media (max-width: 800px) {
      header, .section-heading { align-items: stretch; flex-direction: column; }
      .mock-scenarios { grid-template-columns: 1fr; }
      .save-bar { top: var(--uui-size-space-2); }
      .connection-empty-state { align-items: start; grid-template-columns: auto minmax(0, 1fr); }
      .connection-empty-state uui-button { grid-column: 1 / -1; justify-self: start; }
    }
    @media (forced-colors: active) {
      .unsaved-indicator::before { background: Highlight; }
    }
  `];
}

export default WebAnalyticsSettingsDashboardElement;

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-settings-dashboard": WebAnalyticsSettingsDashboardElement;
  }
}
