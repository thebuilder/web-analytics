import {
  LitElement,
  css,
  customElement,
  html,
  property,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { UUIInputElement, UUIToggleElement } from "@umbraco-cms/backoffice/external/uui";
import type { AnalyticsConnectionSettingsResponse, AnalyticsProviderDescriptor } from "../api/types.gen.js";
import type { ConnectionValidationErrors } from "./settings-model.js";
import { parseTeamReference, teamReference } from "./settings-model.js";
import { getMockScenario } from "./mock-scenarios.js";
import { identifierField, identifierValue, providerLogo } from "./provider-identity.js";
import "@umbraco-cms/backoffice/document";

export type EditableAnalyticsConnection = AnalyticsConnectionSettingsResponse;
export type ConnectionActionStatus = { type: "success" | "error" | "info"; message: string };

@customElement("web-analytics-connection-editor")
export class AnalyticsConnectionEditorElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) connection!: EditableAnalyticsConnection;
  @property({ attribute: false }) descriptor?: AnalyticsProviderDescriptor;
  @property({ attribute: false }) errors: ConnectionValidationErrors = {};
  @property({ attribute: false }) status?: ConnectionActionStatus;
  @property({ type: Boolean }) mockConnectionsEnabled = false;
  @property({ type: Boolean }) dirty = false;
  @property({ type: Boolean }) testing = false;
  @state() private _tokenCopyStatus?: "copied" | "failed";
  private _copyStatusTimer?: number;

  disconnectedCallback(): void {
    window.clearTimeout(this._copyStatusTimer);
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    if (!this.descriptor || !identifierValue(this.connection, this.descriptor)) {
      this.shadowRoot?.querySelector<HTMLDetailsElement>(".connection-shell")?.setAttribute("open", "");
    }
  }

  focusFirstInvalid(): boolean {
    const input = this.shadowRoot?.querySelector<HTMLElement>('[aria-invalid="true"]');
    input?.focus();
    return Boolean(input);
  }

  #update(patch: Partial<EditableAnalyticsConnection>): void {
    this.dispatchEvent(new CustomEvent<EditableAnalyticsConnection>("connection-change", {
      detail: { ...this.connection, ...patch },
      bubbles: true,
      composed: true,
    }));
  }

  #input(field: keyof EditableAnalyticsConnection, event: Event): void {
    this.#update({ [field]: String((event.target as UUIInputElement).value ?? "") });
  }

  #documentRoots(event: Event): void {
    this.#update({ documentRootKeys: (event.target as HTMLElement & { selection: string[] }).selection });
  }

  #documentTypes(event: Event): void {
    this.#update({ enabledDocumentTypeKeys: (event.target as HTMLElement & { selection: string[] }).selection });
  }

  #allDocumentTypes(event: Event): void {
    this.#update({ enableAllDocumentTypes: (event.target as UUIToggleElement).checked });
  }

  #feature(field: "enableEvents" | "enableFlags", event: Event): void {
    this.#update({ [field]: (event.target as UUIToggleElement).checked });
  }

  #teamReference(event: Event): void {
    this.#update(parseTeamReference(String((event.target as UUIInputElement).value ?? "")));
  }

  #eventPropertyNames(event: Event): void {
    const names = String((event.target as HTMLElement & { value?: string }).value ?? "")
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter((name, index, values) => name && values.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index);
    this.#update({ eventPropertyNames: names });
  }

  #eventPropertySummary(): string {
    const count = this.connection.eventPropertyNames.length;
    return count ? `${count} custom propert${count === 1 ? "y" : "ies"}` : "Built-in properties only";
  }

  #dashboardReportsSummary(descriptor: AnalyticsProviderDescriptor): string {
    const reports = [
      descriptor.capabilities.events && this.connection.enableEvents,
      descriptor.capabilities.flags && this.connection.enableFlags,
    ].filter((enabled) => enabled).length;
    const supported = Number(descriptor.capabilities.events) + Number(descriptor.capabilities.flags);
    return `${reports} of ${supported} enabled`;
  }

  #mappingSummary(): string {
    const roots = this.connection.documentRootKeys.length;
    return roots ? `${roots} document root${roots === 1 ? "" : "s"}` : "Global analytics only";
  }

  #documentTypeSummary(): string {
    if (this.connection.enableAllDocumentTypes) return "All document types";
    const count = this.connection.enabledDocumentTypeKeys.length;
    return count ? `${count} selected document type${count === 1 ? "" : "s"}` : "No document workspace analytics";
  }

  async #copyTokenKey(): Promise<void> {
    window.clearTimeout(this._copyStatusTimer);
    try {
      await navigator.clipboard.writeText(`WebAnalytics__ConnectionAccessTokens__${this.connection.key}`);
      this._tokenCopyStatus = "copied";
    } catch {
      this._tokenCopyStatus = "failed";
    }
    this._copyStatusTimer = window.setTimeout(() => { this._tokenCopyStatus = undefined; }, 3000);
  }

  #dispatch(name: "test-connection" | "remove-connection"): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  #renderCredentialSection(connection: EditableAnalyticsConnection, descriptor: AnalyticsProviderDescriptor) {
    const required = !connection.hasAccessToken;
    return html`<details class="config-section token-section">
      <summary><span>${required ? "Connection credential" : "Credential override"}</span><small>${required ? "Required before testing" : connection.hasAccessTokenOverride ? "Configured on the server" : "Using shared credential"}</small></summary>
      <div class="config-content token-content">
        <p>
          ${required
            ? `No shared ${connection.provider} ${descriptor.credential.label} was detected. Add a connection-specific credential before testing this connection.`
            : `Set a connection-specific credential only when this connection cannot use the shared ${connection.provider} ${descriptor.credential.label}.`}
          <a href=${descriptor.credential.documentationUrl} target="_blank" rel="noopener noreferrer" aria-label=${`Create a ${connection.provider} ${descriptor.credential.label} (opens in a new tab)`}>
            Create a ${connection.provider} ${descriptor.credential.label}<uui-icon name="icon-out" aria-hidden="true"></uui-icon>
          </a>
        </p>
        <div class="token-key">
          <code>WebAnalytics__ConnectionAccessTokens__${connection.key}</code>
          <uui-button compact look="secondary" label="Copy credential setting name" @click=${this.#copyTokenKey}>${this._tokenCopyStatus === "copied" ? "Copied" : "Copy"}</uui-button>
        </div>
        <span class=${`copy-feedback${this._tokenCopyStatus === "failed" ? " error" : ""}`} role="status" aria-live="polite">
          ${this._tokenCopyStatus === "failed" ? "Could not copy the setting name. Select and copy it manually." : this._tokenCopyStatus === "copied" ? "Setting name copied." : ""}
        </span>
      </div>
    </details>`;
  }

  render() {
    const connection = this.connection;
    const descriptor = this.descriptor;
    if (!descriptor) return this.#renderUnsupportedProvider();
    const field = identifierField(descriptor);
    const identifier = identifierValue(connection, descriptor);
    if (!field || identifier === undefined) return this.#renderUnsupportedProvider();
    const isMock = connection.mockScenario != null;
    const mockScenario = getMockScenario(connection.mockScenario);
    const testHint = this.dirty
      ? "Save changes before testing this connection."
      : isMock && !this.mockConnectionsEnabled
        ? "Mock connections are only active in Development."
        : !identifier
          ? `Enter the ${descriptor.identifier.label} before testing.`
          : !connection.hasAccessToken
            ? "Add a server-side credential before testing this connection."
        : "Test the saved connection.";
    const tokenStatus = isMock
      ? this.mockConnectionsEnabled ? "Development mock" : "Inactive mock"
      : connection.hasAccessTokenOverride
      ? "Credential override"
      : connection.hasAccessToken
        ? "Shared credential"
          : "Credential missing";
    const health = this.testing
      ? { label: "Testing", color: undefined }
      : this.status?.type === "success"
        ? { label: "Connected", color: "positive" as const }
        : this.status?.type === "error"
          ? { label: "Needs attention", color: "danger" as const }
          : isMock
            ? this.mockConnectionsEnabled
              ? { label: "Ready", color: "positive" as const }
              : { label: "Inactive", color: "warning" as const }
            : !identifier || !connection.hasAccessToken
              ? { label: "Setup required", color: "warning" as const }
              : { label: "Not tested", color: undefined };
    const testDisabled = this.testing
      || this.dirty
      || (isMock ? !this.mockConnectionsEnabled : !identifier || !connection.hasAccessToken);
    return html`
      <uui-box class="connection-card">
        <details class="connection-shell">
          <summary class="connection-summary">
            <span class="provider-mark">${isMock ? html`<uui-icon name="icon-lab" aria-hidden="true"></uui-icon>` : providerLogo(descriptor)}</span>
            <span class="summary-copy">
              <strong>${connection.displayName || identifier || "New connection"}</strong>
              <span>${isMock ? "Mock scenario" : `${connection.provider} · ${identifier || "Identifier required"}`} · ${this.#mappingSummary()}</span>
            </span>
            <span class="summary-state">
              <span class="summary-health">
                ${health.color ? html`<uui-tag color=${health.color}>${health.label}</uui-tag>` : html`<uui-tag>${health.label}</uui-tag>`}
                <uui-icon name="icon-navigation-down" aria-hidden="true"></uui-icon>
              </span>
              <small>${tokenStatus}</small>
            </span>
          </summary>

          <div class="connection-body">
            <section class="essentials" aria-labelledby=${`${connection.key}-project-heading`}>
              <div class=${`essentials-header${this.status ? " has-status" : ""}`}>
                <div class="essentials-heading">
                  <h3 id=${`${connection.key}-project-heading`}>${isMock ? "Mock data" : `${connection.provider} connection`}</h3>
                </div>
                ${this.status ? html`<div class="action-status" role=${this.status.type === "error" ? "alert" : "status"} aria-live="polite">
                  <span class=${this.status.type}><uui-icon name=${this.status.type === "success" ? "icon-check" : this.status.type === "error" ? "icon-alert" : "icon-info"}></uui-icon>${this.status.message}</span>
                </div>` : ""}
                <div class="connection-actions">
                  <uui-button
                    look="secondary"
                    label=${testHint}
                    title=${testHint}
                    .state=${this.testing ? "waiting" : undefined}
                    ?disabled=${testDisabled}
                    @click=${() => this.#dispatch("test-connection")}>Test connection</uui-button>
                  <uui-button look="secondary" color="danger" label="Delete connection" @click=${() => this.#dispatch("remove-connection")}>Delete</uui-button>
                </div>
              </div>
              ${isMock ? html`
                <p class="section-intro mock-description">${mockScenario?.description ?? "Deterministic analytics data."} This connection never contacts an analytics provider.</p>
              ` : html`
                <div class="fields two-columns">
                  ${this.#field(descriptor.identifier.label, field, identifier, descriptor.identifier.description, this.errors[field])}
                  ${descriptor.team ? this.#teamReferenceField(descriptor.team, teamReference(connection), this.errors.team) : ""}
                </div>
              `}
            </section>

            ${!isMock && !connection.hasAccessToken ? this.#renderCredentialSection(connection, descriptor) : ""}

            <details class="config-section">
              <summary><span>Page analytics</span><small>${this.#mappingSummary()}</small></summary>
              <div class="config-content mapping-content">
                <p class="section-intro">Select the Umbraco site roots that use this analytics connection. Leave empty for global analytics only.</p>
                <div class="fields">
                  <uui-form-layout-item>
                    <uui-label slot="label">Document roots</uui-label>
                    <umb-input-document .selection=${connection.documentRootKeys} @change=${this.#documentRoots}></umb-input-document>
                    <span slot="description">Documents below a selected root use this connection for page analytics.</span>
                  </uui-form-layout-item>
                </div>
              </div>
            </details>

            <details class="config-section">
              <summary><span>Document workspace</span><small>${this.#documentTypeSummary()}</small></summary>
              <div class="config-content">
                <p class="section-intro">Choose which document types show an Analytics workspace tab. This does not affect the global dashboard.</p>
                <uui-toggle label="Show analytics on all document types" ?checked=${connection.enableAllDocumentTypes} @change=${this.#allDocumentTypes}>Show analytics on all document types</uui-toggle>
                ${connection.enableAllDocumentTypes ? html`<p class="section-intro toggle-help">New document types are included automatically.</p>` : html`
                  <uui-form-layout-item class="document-types">
                    <uui-label slot="label">Selected document types</uui-label>
                    <umb-input-document-type documentTypesOnly .selection=${connection.enabledDocumentTypeKeys} @change=${this.#documentTypes}></umb-input-document-type>
                  </uui-form-layout-item>
                `}
              </div>
            </details>

            ${descriptor.capabilities.events || descriptor.capabilities.flags ? html`
              <details class="config-section">
                <summary><span>Dashboard reports</span><small>${this.#dashboardReportsSummary(descriptor)}</small></summary>
                <div class="config-content report-options">
                  <p class="section-intro">Choose the optional reports shown for this connection.</p>
                  ${descriptor.capabilities.events ? html`
                    <div class="report-option">
                      <uui-toggle label="Show custom events" ?checked=${connection.enableEvents} @change=${(event: Event) => this.#feature("enableEvents", event)}>Custom events</uui-toggle>
                      <p>Show event totals, filters, and event details in Analytics.</p>
                    </div>
                  ` : ""}
                  ${descriptor.capabilities.flags ? html`
                    <div class="report-option">
                      <uui-toggle label="Show feature flags" ?checked=${connection.enableFlags} @change=${(event: Event) => this.#feature("enableFlags", event)}>Feature flags</uui-toggle>
                      <p>Show feature flag usage and value breakdowns in Analytics.</p>
                    </div>
                  ` : ""}
                </div>
              </details>
            ` : ""}

            ${!isMock && descriptor.eventProperties && connection.enableEvents ? html`
              <details class="config-section">
                <summary><span>Event properties</span><small>${this.#eventPropertySummary()}</small></summary>
                <div class="config-content event-properties-content">
                  <p class="section-intro">${descriptor.eventProperties.description} Add one name per line. The standard <code>url</code> and <code>path</code> properties are included automatically for matching events.</p>
                  <uui-form-layout-item>
                    <uui-label slot="label" for=${`${connection.key}-event-properties`}>Custom property names</uui-label>
                    <div class="field-control">
                      <uui-textarea
                        id=${`${connection.key}-event-properties`}
                        label="Custom event property names"
                        .value=${connection.eventPropertyNames.join("\n")}
                        rows="5"
                        aria-invalid=${this.errors.eventPropertyNames ? "true" : "false"}
                        aria-describedby=${`${connection.key}-event-properties-${this.errors.eventPropertyNames ? "error" : "description"}`}
                        @input=${this.#eventPropertyNames}></uui-textarea>
                      <span id=${`${connection.key}-event-properties-${this.errors.eventPropertyNames ? "error" : "description"}`} class=${this.errors.eventPropertyNames ? "field-error" : "field-description"}>
                        ${this.errors.eventPropertyNames ? html`<uui-icon name="icon-alert" aria-hidden="true"></uui-icon>${this.errors.eventPropertyNames}` : `Up to ${descriptor.eventProperties.maximumNames} names.`}
                      </span>
                    </div>
                  </uui-form-layout-item>
                </div>
              </details>
            ` : ""}

            ${!isMock && connection.hasAccessToken ? this.#renderCredentialSection(connection, descriptor) : ""}
          </div>
        </details>
      </uui-box>
    `;
  }

  #field(
    label: string,
    field: "projectId" | "siteId",
    value: string,
    description?: string,
    error?: string,
    className = "",
  ) {
    const id = `${this.connection.key}-${field}`;
    const required = true;
    return html`
      <uui-form-layout-item class=${className}>
        <uui-label slot="label" for=${id} ?required=${required}>${label}</uui-label>
        <div class="field-control">
          <uui-input id=${id} name=${field} label=${label} .value=${value} maxlength="200" ?required=${required} aria-invalid=${error ? "true" : "false"} aria-describedby=${error ? `${id}-error` : description ? `${id}-description` : ""} @input=${(event: Event) => this.#input(field, event)}></uui-input>
          ${error ? html`<span id=${`${id}-error`} class="field-error"><uui-icon name="icon-alert" aria-hidden="true"></uui-icon>${error}</span>` : description ? html`<span id=${`${id}-description`} class="field-description">${description}</span>` : ""}
        </div>
      </uui-form-layout-item>
    `;
  }

  #renderUnsupportedProvider() {
    return html`<uui-box class="connection-card unsupported-provider" role="alert">
      <p>Unsupported analytics provider: ${this.connection.provider}. This connection cannot be saved or tested until the server returns a supported provider descriptor.</p>
    </uui-box>`;
  }

  #teamReferenceField(descriptor: NonNullable<AnalyticsProviderDescriptor["team"]>, value: string, error?: string) {
    const id = `${this.connection.key}-team-reference`;
    return html`
      <uui-form-layout-item>
        <uui-label slot="label" for=${id}>${descriptor.label}</uui-label>
        <div class="field-control">
          <uui-input
            id=${id}
            name="teamReference"
            label=${descriptor.label}
            .value=${value}
            maxlength="200"
            aria-invalid=${error ? "true" : "false"}
            aria-describedby=${`${id}-${error ? "error" : "description"}`}
            @input=${this.#teamReference}></uui-input>
          <span id=${`${id}-${error ? "error" : "description"}`} class=${error ? "field-error" : "field-description"}>
            ${error ? html`<uui-icon name="icon-alert" aria-hidden="true"></uui-icon>${error}` : descriptor.description}
          </span>
        </div>
      </uui-form-layout-item>
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { container-type: inline-size; display: block; }
    .connection-card { --uui-box-default-padding: 0; overflow: hidden; }
    details, summary { box-sizing: border-box; }
    summary { cursor: pointer; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    .connection-summary { align-items: center; appearance: none; background: transparent; border: 0; color: inherit; cursor: pointer; display: grid; font: inherit; gap: var(--uui-size-space-4); grid-template-columns: auto minmax(0, 1fr) auto; inline-size: 100%; min-block-size: 4rem; padding: var(--uui-size-space-4) var(--uui-size-space-5); text-align: start; }
    .connection-summary:hover { background: color-mix(in srgb, var(--uui-color-interactive) 3%, var(--uui-color-surface)); }
    .connection-summary:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .summary-copy { display: grid; gap: var(--uui-size-space-1); min-inline-size: 0; }
    .summary-copy strong { font-size: var(--uui-type-h5-size); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .summary-copy > span { color: var(--uui-color-text-alt); overflow-wrap: anywhere; }
    .provider-mark { align-items: center; background: var(--uui-color-surface-alt); block-size: var(--uui-size-8); color: var(--uui-color-text); display: inline-flex; inline-size: var(--uui-size-8); justify-content: center; }
    .provider-logo { block-size: var(--uui-size-5); display: block; inline-size: var(--uui-size-5); }
    .provider-mark > uui-icon { font-size: var(--uui-size-5); }
    .summary-state { align-items: end; display: grid; gap: var(--uui-size-space-1); justify-items: end; min-inline-size: 0; }
    .summary-state small { color: var(--uui-color-text-alt); max-inline-size: 24ch; overflow-wrap: anywhere; text-align: end; }
    .summary-health { align-items: center; display: flex; gap: var(--uui-size-space-3); }
    .summary-health > uui-icon { transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1); }
    .connection-shell[open] .summary-health > uui-icon { transform: rotate(180deg); }
    .connection-body { border-top: 1px solid var(--uui-color-border); padding: 0 var(--uui-size-space-5) var(--uui-size-space-4); }
    .essentials { padding: var(--uui-size-space-4) 0 var(--uui-size-space-5); }
    .essentials-header { align-items: center; display: grid; gap: var(--uui-size-space-4); grid-template-areas: "heading actions"; grid-template-columns: minmax(0, 1fr) auto; margin-block-end: var(--uui-size-space-4); }
    .essentials-header.has-status { grid-template-areas: "heading actions" "status status"; }
    .essentials-heading { grid-area: heading; min-inline-size: 0; }
    .essentials-heading h3 { font-size: var(--uui-type-h5-size); margin: 0; }
    .connection-actions { align-items: center; display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: var(--uui-size-space-3); grid-area: actions; justify-content: flex-end; }
    .action-status { grid-area: status; justify-self: start; min-inline-size: 0; }
    .action-status span { align-items: center; display: flex; gap: var(--uui-size-space-2); max-inline-size: 70ch; overflow-wrap: anywhere; text-align: start; }
    .action-status .success { color: var(--uui-color-positive-standalone); }
    .action-status .error { color: var(--uui-color-danger-standalone); }
    .action-status .info { color: var(--uui-color-text-alt); }
    .section-intro { color: var(--uui-color-text-alt); margin: var(--uui-size-space-2) 0 var(--uui-size-space-4); max-inline-size: 70ch; }
    .fields { display: grid; gap: var(--uui-size-space-4); }
    .essentials .fields { column-gap: var(--uui-size-space-6); row-gap: var(--uui-size-space-4); }
    .fields > uui-form-layout-item { margin-block: 0; }
    .two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .config-section { border-top: 1px solid var(--uui-color-border); }
    .config-section > summary { align-items: center; display: flex; gap: var(--uui-size-space-4); justify-content: space-between; padding: var(--uui-size-space-4) 0; }
    .config-section > summary::after { color: var(--uui-color-interactive); content: "+"; font-size: var(--uui-size-6); line-height: 1; margin-inline-start: var(--uui-size-space-2); }
    .config-section[open] > summary::after { content: "−"; }
    .config-section > summary:hover span { text-decoration: underline; }
    .config-section > summary:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    .config-section > summary span { font-weight: 700; }
    .token-section > summary span { font-weight: 600; }
    .config-section > summary small { color: var(--uui-color-text-alt); font-size: var(--uui-type-small-size); font-weight: 400; margin-inline-start: auto; min-inline-size: 0; overflow-wrap: anywhere; text-align: end; }
    .config-content { padding: 0 0 var(--uui-size-space-5); }
    .config-content > uui-form-layout-item { margin-top: var(--uui-size-space-4); max-inline-size: 32rem; }
    .token-content p { margin-top: 0; }
    .token-content a { align-items: center; color: var(--uui-color-interactive); display: inline-flex; gap: var(--uui-size-space-1); margin-inline-start: var(--uui-size-space-1); }
    .token-content a uui-icon { font-size: 0.875em; }
    .token-key { align-items: center; background: var(--uui-color-surface-alt); display: flex; gap: var(--uui-size-space-3); justify-content: space-between; max-inline-size: 52rem; padding: var(--uui-size-space-3); }
    .copy-feedback { color: var(--uui-color-positive-standalone); display: block; margin-block-start: var(--uui-size-space-2); min-block-size: 1lh; }
    .copy-feedback.error { color: var(--uui-color-danger-standalone); }
    code { font-family: var(--uui-font-monospace); overflow-wrap: anywhere; }
    .mapping-content .fields { max-inline-size: 32rem; }
    .event-properties-content > uui-form-layout-item { margin-top: 0; max-inline-size: 32rem; }
    .report-options { display: grid; gap: var(--uui-size-space-4); }
    .report-options > .section-intro { margin-bottom: 0; }
    .report-option { display: grid; gap: var(--uui-size-space-1); max-inline-size: 40rem; }
    .report-option p { color: var(--uui-color-text-alt); margin: 0 0 0 var(--uui-size-7); }
    .document-types { margin-top: var(--uui-size-space-4); }
    .toggle-help { margin-bottom: 0; }
    .field-control { display: grid; gap: var(--uui-size-space-2); }
    .field-description { color: var(--uui-color-text); font-size: var(--uui-type-small-size); }
    .field-error { align-items: center; color: var(--uui-color-danger-standalone); display: flex; gap: var(--uui-size-space-1); }
    uui-input, uui-textarea { inline-size: 100%; }
    uui-input[aria-invalid="true"], uui-textarea[aria-invalid="true"] { --uui-color-border: var(--uui-color-danger); }
    @container (max-width: 48rem) {
      .two-columns { grid-template-columns: 1fr; }
      .connection-summary { align-items: start; }
    }
    @container (max-width: 34rem) {
      .connection-summary { align-items: start; grid-template-columns: auto minmax(0, 1fr); }
      .summary-state { grid-column: 2; justify-items: start; }
      .summary-state small { text-align: start; }
      .essentials-header { align-items: stretch; grid-template-areas: "heading" "actions"; grid-template-columns: 1fr; }
      .essentials-header.has-status { grid-template-areas: "heading" "status" "actions"; }
      .summary-state { justify-content: flex-start; }
      .connection-actions { justify-content: flex-start; }
      .config-section > summary { align-items: flex-start; flex-wrap: wrap; }
      .config-section > summary small { margin-inline-start: 0; }
      .token-key { align-items: stretch; flex-direction: column; }
    }
    @media (prefers-reduced-motion: reduce) {
      .summary-health > uui-icon { transition: none; }
    }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "web-analytics-connection-editor": AnalyticsConnectionEditorElement;
  }
}
