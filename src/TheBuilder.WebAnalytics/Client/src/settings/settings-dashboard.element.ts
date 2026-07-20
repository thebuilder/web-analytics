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
import { ANALYTICS_PROVIDERS, providerLogo } from "./provider-identity.js";

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
  @state() private _showProviderPicker = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
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
    const { [connection.key]: _discardedStatus, ...remainingStatuses } = this._connectionStatuses;
    this._connectionStatuses = remainingStatuses;
    this.#patch({ connections });
  }

  #addConnection(provider: AnalyticsProvider): void {
    const hasAccessToken = this._settings?.providerTokens.some((item) => item.provider === provider && item.hasAccessToken) ?? false;
    this.#appendConnection({ kind: "provider", provider, hasAccessToken });
    this._showProviderPicker = false;
  }

  #toggleProviderPicker(): void {
    this._showProviderPicker = !this._showProviderPicker;
    void this.updateComplete.then(() => {
      if (this._showProviderPicker) {
        this.shadowRoot?.querySelector<HTMLElement>(".provider-choice")?.focus();
      } else {
        this.shadowRoot?.querySelector<HTMLElement>('[label="Add analytics connection"], [label="Choose analytics provider"]')?.focus();
      }
    });
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
    void this.updateComplete.then(async () => {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const editor = this.shadowRoot?.querySelector<AnalyticsConnectionEditorElement>("vercel-analytics-connection-editor:last-of-type");
      editor?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
      await editor?.updateComplete;
      const fieldName = provider === "Plausible" ? "siteId" : "projectId";
      editor?.shadowRoot?.querySelector<HTMLElement>(`[name="${fieldName}"]`)?.focus();
    });
  }

  #removeConnection(index: number): void {
    if (!this._settings) return;
    const connection = this._settings.connections[index];
    if (!connection) return;
    if (!window.confirm(`Delete “${connection.displayName || connection.siteId || connection.projectId || "this connection"}” from Web Analytics? The connection is removed when you save settings.`)) return;
    const connections = this._settings.connections.filter((_, itemIndex) => itemIndex !== index);
    const { [connection.key]: _discardedStatus, ...remainingStatuses } = this._connectionStatuses;
    this._connectionStatuses = remainingStatuses;
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

  #renderProviderPicker() {
    if (!this._showProviderPicker) return "";
    return html`
      <div id="provider-picker" class="provider-picker" role="group" aria-labelledby="provider-picker-heading">
        <div class="provider-picker-heading">
          <div>
            <h3 id="provider-picker-heading">Choose an analytics provider</h3>
            <p>The provider cannot be changed after this connection is created.</p>
          </div>
          <uui-button type="button" compact look="secondary" label="Close provider choices" @click=${this.#toggleProviderPicker}>Close</uui-button>
        </div>
        <div class="provider-choices">
          ${ANALYTICS_PROVIDERS.map((item) => {
            const credential = this._settings?.providerTokens.find((token) => token.provider === item.provider);
            return html`
              <button class="provider-choice" type="button" aria-label=${`Add ${item.provider} connection`} @click=${() => this.#addConnection(item.provider)}>
                <span class="provider-mark">${providerLogo(item.provider)}</span>
                <span class="provider-choice-copy">
                  <strong>${item.provider}</strong>
                  <span>${item.description} · Requires ${item.identifier}</span>
                </span>
                <span class=${`provider-choice-status ${credential?.hasAccessToken ? "configured" : "missing"}`}>
                  <uui-icon name=${credential?.hasAccessToken ? "icon-check" : "icon-alert"} aria-hidden="true"></uui-icon>
                  ${credential?.hasAccessToken ? "Shared credential detected" : "No shared credential detected"}
                </span>
                <uui-icon class="provider-choice-arrow" name="icon-navigation-right" aria-hidden="true"></uui-icon>
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  #renderProviders() {
    if (!this._settings) return "";
    return html`
      <uui-box headline="Providers" class="providers">
        <p class="providers-intro">Web Analytics reads credentials from your server configuration. Detection confirms presence only; test each saved connection to verify access.</p>
        <div class="provider-list">
          ${ANALYTICS_PROVIDERS.map((item) => {
            const token = this._settings?.providerTokens.find((candidate) => candidate.provider === item.provider);
            const connections = this._settings?.connections.filter((connection) => connection.mockScenario == null && connection.provider === item.provider) ?? [];
            const overrideCount = connections.filter((connection) => connection.hasAccessTokenOverride).length;
            const status = token?.hasAccessToken
              ? { kind: "configured", label: "Shared credential detected", help: "Connections can use the credential from server configuration." }
              : overrideCount > 0
                ? { kind: "configured", label: `${overrideCount} connection override${overrideCount === 1 ? "" : "s"}`, help: "Connection-specific credentials can be tested after saving." }
                : { kind: "missing", label: "No shared credential", help: `Configure the ${item.provider} ${item.credential} in server settings, then restart Umbraco.` };
            return html`
              <section class="provider-row" aria-labelledby=${`provider-${item.provider}`}>
                <span class="provider-mark">${providerLogo(item.provider)}</span>
                <span class="provider-row-copy">
                  <strong id=${`provider-${item.provider}`}>${item.provider}</strong>
                  <span>${connections.length} connection${connections.length === 1 ? "" : "s"}</span>
                </span>
                <span class=${`provider-readiness ${status.kind}`}>
                  <span><uui-icon name=${status.kind === "configured" ? "icon-check" : "icon-info"} aria-hidden="true"></uui-icon>${status.label}</span>
                  <small>${status.help}</small>
                </span>
              </section>
            `;
          })}
        </div>
      </uui-box>
    `;
  }

  #renderGeneralSettings() {
    if (!this._settings) return "";
    return html`
      <uui-box headline="General settings" class="general">
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
            <uui-label slot="label" for="default-range">Default reporting range</uui-label>
            <div class="field-with-help">
              <uui-input
                id="default-range"
                type="number"
                min="1"
                max="730"
                label="Default reporting range in days"
                aria-describedby="default-range-help"
                .value=${String(this._settings.defaultRangeDays)}
                @input=${(event: Event) => this.#patch({ defaultRangeDays: Number((event.target as UUIInputElement).value) })}></uui-input>
              <span id="default-range-help" class="field-help">Days shown when editors first open Analytics.</span>
            </div>
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
              <span id="cache-duration-help" class="field-help">How long reports stay cached before fresh data is requested. Use <code>hh:mm:ss</code>, for example <code>00:05:00</code>.</span>
            </div>
          </uui-form-layout-item>
        </div>
      </uui-box>
    `;
  }

  #renderDevelopmentData() {
    if (!this._settings?.canCreateMockConnections) return "";
    return html`
      <uui-box headline="Development data" class="mock-settings">
        <p class="mock-intro">Create deterministic local connections to check dashboard states without contacting an analytics provider. Mock connections are available only in Development.</p>
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
    `;
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
        ${this._dirty ? html`
          <div class="save-bar" aria-label="Unsaved Web Analytics settings">
            <span class="unsaved-indicator" role="status" aria-live="polite">Unsaved changes</span>
            <uui-button type="submit" look="primary" label="Save Web Analytics settings" .state=${this._saving ? "waiting" : undefined} ?disabled=${this._saving}>Save settings</uui-button>
          </div>
        ` : ""}

        ${this._status ? html`<div class=${`status ${this._status.type}`} role=${this._status.type === "error" ? "alert" : "status"} aria-live="polite"><uui-icon name=${this._status.type === "success" ? "icon-check" : "icon-alert"}></uui-icon><span>${this._status.message}</span></div>` : ""}

        <section class="connections-section" aria-labelledby="connections-heading">
          <div class="section-heading">
            <div><h2 id="connections-heading">Connections</h2><p>Add each analytics site or project that editors should be able to view.</p></div>
            ${hasConnections ? html`<uui-button type="button" look="primary" label="Add analytics connection" aria-expanded=${this._showProviderPicker ? "true" : "false"} aria-controls="provider-picker" @click=${this.#toggleProviderPicker}>Add connection</uui-button>` : ""}
          </div>
          ${this.#renderProviderPicker()}
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
            ${!hasConnections && !this._showProviderPicker ? html`
              <div class="connection-empty-state">
                <uui-icon name="icon-globe" aria-hidden="true"></uui-icon>
                <div>
                  <h3>Connect your first analytics provider</h3>
                  <p>Add the project or site that editors should be able to view. Credentials stay in your server configuration.</p>
                </div>
                <uui-button type="button" look="primary" label="Choose analytics provider" aria-expanded=${this._showProviderPicker ? "true" : "false"} aria-controls="provider-picker" @click=${this.#toggleProviderPicker}>Add connection</uui-button>
              </div>
            ` : ""}
          </div>
        </section>

        ${this.#renderProviders()}
        ${this.#renderGeneralSettings()}
        ${this.#renderDevelopmentData()}

      </form>
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { --analytics-z-sticky-action: 10; display: block; }
    form { max-width: 76rem; margin-inline: auto; padding: var(--uui-size-layout-1); }
    .section-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--uui-size-layout-1); }
    .section-heading > div { min-inline-size: 0; }
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
    h2 { margin: 0; }
    .section-heading p { color: var(--uui-color-text-alt); margin-block: var(--uui-size-space-2) 0; text-wrap: pretty; }
    .status { align-items: flex-start; border: 1px solid var(--uui-color-border); display: flex; gap: var(--uui-size-space-2); margin-block: var(--uui-size-space-5); overflow-wrap: anywhere; padding: var(--uui-size-space-3) var(--uui-size-space-4); }
    .status.success { background: color-mix(in srgb, var(--uui-color-positive) 8%, var(--uui-color-surface)); border-color: color-mix(in srgb, var(--uui-color-positive) 35%, var(--uui-color-border)); }
    .status.error { background: color-mix(in srgb, var(--uui-color-danger) 7%, var(--uui-color-surface)); border-color: color-mix(in srgb, var(--uui-color-danger) 35%, var(--uui-color-border)); }
    .connections-section { margin-block-start: 0; }
    .providers, .general, .mock-settings { margin-block-start: var(--uui-size-layout-2); }
    .providers, .general { container-type: inline-size; }
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
    .providers-intro { color: var(--uui-color-text-alt); margin: 0 0 var(--uui-size-space-5); max-inline-size: 70ch; text-wrap: pretty; }
    .provider-list { border-block: 1px solid var(--uui-color-border); }
    .provider-row { align-items: center; display: grid; gap: var(--uui-size-space-4); grid-template-columns: auto minmax(10rem, 0.75fr) minmax(18rem, 1.25fr); min-inline-size: 0; padding: var(--uui-size-space-4) 0; }
    .provider-row + .provider-row { border-top: 1px solid var(--uui-color-border); }
    .provider-row-copy { display: grid; gap: var(--uui-size-space-1); min-inline-size: 0; }
    .provider-row-copy strong { font-size: var(--uui-type-h5-size); }
    .provider-row-copy > span { color: var(--uui-color-text-alt); }
    .provider-readiness { display: grid; gap: var(--uui-size-space-1); justify-items: start; min-inline-size: 0; }
    .provider-readiness > span { align-items: center; display: inline-flex; font-weight: 700; gap: var(--uui-size-space-1); }
    .provider-readiness.configured > span { color: var(--uui-color-positive-standalone); }
    .provider-readiness.missing > span { color: var(--uui-color-text); }
    .provider-readiness small { color: var(--uui-color-text-alt); overflow-wrap: anywhere; text-wrap: pretty; }
    .visually-hidden { block-size: 1px; clip: rect(0 0 0 0); clip-path: inset(50%); inline-size: 1px; overflow: hidden; position: absolute; white-space: nowrap; }
    .section-heading { margin-bottom: var(--uui-size-space-4); }
    .provider-picker { background: var(--uui-color-surface); border: 1px solid var(--uui-color-border); margin-block-end: var(--uui-size-space-5); }
    .provider-picker-heading { align-items: flex-start; display: flex; gap: var(--uui-size-space-4); justify-content: space-between; padding: var(--uui-size-space-4) var(--uui-size-space-5); }
    .provider-picker-heading h3 { font-size: var(--uui-type-h5-size); margin: 0; text-wrap: balance; }
    .provider-picker-heading p { color: var(--uui-color-text-alt); margin: var(--uui-size-space-1) 0 0; text-wrap: pretty; }
    .provider-choices { border-top: 1px solid var(--uui-color-border); }
    .provider-choice { align-items: center; appearance: none; background: transparent; border: 0; color: inherit; cursor: pointer; display: grid; font: inherit; gap: var(--uui-size-space-4); grid-template-columns: auto minmax(0, 1fr) auto auto; inline-size: 100%; min-block-size: 4rem; padding: var(--uui-size-space-4) var(--uui-size-space-5); text-align: start; }
    .provider-choice + .provider-choice { border-top: 1px solid var(--uui-color-border); }
    .provider-choice:hover { background: color-mix(in srgb, var(--uui-color-interactive) 4%, var(--uui-color-surface)); }
    .provider-choice:active { background: color-mix(in srgb, var(--uui-color-interactive) 7%, var(--uui-color-surface)); }
    .provider-choice:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .provider-mark { align-items: center; background: var(--uui-color-surface-alt); block-size: var(--uui-size-8); color: var(--uui-color-text); display: inline-flex; inline-size: var(--uui-size-8); justify-content: center; }
    .provider-logo { block-size: var(--uui-size-5); display: block; inline-size: var(--uui-size-5); }
    .provider-choice-copy { display: grid; gap: var(--uui-size-space-1); min-inline-size: 0; }
    .provider-choice-copy strong { font-size: var(--uui-type-h5-size); }
    .provider-choice-copy > span { color: var(--uui-color-text-alt); overflow-wrap: anywhere; }
    .provider-choice-status { align-items: center; display: inline-flex; font-size: var(--uui-type-small-size); gap: var(--uui-size-space-1); white-space: nowrap; }
    .provider-choice-status.configured { color: var(--uui-color-positive-standalone); }
    .provider-choice-status.missing { color: var(--uui-color-text-alt); }
    .provider-choice-arrow { color: var(--uui-color-interactive); transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1); }
    .provider-choice:hover .provider-choice-arrow { transform: translateX(var(--uui-size-space-1)); }
    .connections { display: grid; gap: var(--uui-size-space-5); }
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
      .provider-row { align-items: start; grid-template-columns: auto minmax(0, 1fr); }
      .provider-readiness { grid-column: 2; }
    }
    @media (max-width: 800px) {
      .section-heading { align-items: stretch; flex-direction: column; }
      .mock-scenarios { grid-template-columns: 1fr; }
      .save-bar { top: var(--uui-size-space-2); }
      .connection-empty-state { align-items: start; grid-template-columns: auto minmax(0, 1fr); }
      .connection-empty-state uui-button { grid-column: 1 / -1; justify-self: start; }
      .provider-choice { align-items: start; grid-template-columns: auto minmax(0, 1fr) auto; }
      .provider-choice-status { grid-column: 2 / -1; white-space: normal; }
      .provider-choice-arrow { grid-column: 3; grid-row: 1; }
      .provider-picker-heading { align-items: stretch; flex-direction: column; }
    }
    @media (forced-colors: active) {
      .unsaved-indicator::before { background: Highlight; }
    }
    @media (prefers-reduced-motion: reduce) {
      .provider-choice-arrow { transition: none; }
      .provider-choice:hover .provider-choice-arrow { transform: none; }
    }
    :host-context([dir="rtl"]) .provider-choice-arrow { transform: scaleX(-1); }
  `];
}

export default WebAnalyticsSettingsDashboardElement;

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-settings-dashboard": WebAnalyticsSettingsDashboardElement;
  }
}
