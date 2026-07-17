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
import type { AnalyticsConnectionSettingsResponse } from "../api/types.gen.js";
import type { ConnectionValidationErrors } from "./settings-model.js";
import { parseTeamReference, teamReference } from "./settings-model.js";
import { getMockScenario } from "./mock-scenarios.js";
import "@umbraco-cms/backoffice/document";

export type EditableAnalyticsConnection = AnalyticsConnectionSettingsResponse;
export type ConnectionActionStatus = { type: "success" | "error" | "info"; message: string };

@customElement("vercel-analytics-connection-editor")
export class VercelAnalyticsConnectionEditorElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) connection!: EditableAnalyticsConnection;
  @property({ attribute: false }) errors: ConnectionValidationErrors = {};
  @property({ attribute: false }) status?: ConnectionActionStatus;
  @property({ type: Boolean }) mockConnectionsEnabled = false;
  @property({ type: Boolean }) dirty = false;
  @property({ type: Boolean }) testing = false;
  @state() private _tokenCopied = false;

  protected firstUpdated(): void {
    if (!this.connection.projectId) {
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

  #teamReference(event: Event): void {
    this.#update(parseTeamReference(String((event.target as UUIInputElement).value ?? "")));
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
    await navigator.clipboard.writeText(`VercelAnalytics__ConnectionAccessTokens__${this.connection.key}`);
    this._tokenCopied = true;
    window.setTimeout(() => { this._tokenCopied = false; }, 2000);
  }

  #dispatch(name: "test-connection" | "remove-connection"): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  render() {
    const connection = this.connection;
    const isMock = connection.mockScenario != null;
    const mockScenario = getMockScenario(connection.mockScenario);
    const testHint = this.dirty
      ? "Save changes before testing this connection."
      : isMock && !this.mockConnectionsEnabled
        ? "Mock connections are only active in Development."
        : "Test the saved connection.";
    const tokenStatus = isMock
      ? this.mockConnectionsEnabled ? "Development mock" : "Inactive mock"
      : connection.hasAccessTokenOverride
      ? "Token override"
      : connection.hasAccessToken
        ? "Shared token"
        : "Token missing";
    const tokenColor = isMock
      ? this.mockConnectionsEnabled ? "positive" : "warning"
      : connection.hasAccessToken ? "positive" : "warning";
    const testDisabled = this.testing
      || this.dirty
      || (isMock ? !this.mockConnectionsEnabled : !connection.projectId);
    return html`
      <uui-box class="connection-card">
        <details class="connection-shell">
          <summary class="connection-summary">
            <span class="summary-copy">
              <strong>${connection.displayName || connection.projectId || "New connection"}</strong>
              <span>${isMock ? "Mock scenario" : connection.projectId || "Project ID required"} · ${this.#mappingSummary()}</span>
            </span>
            <span class="summary-state">
              <uui-tag color=${tokenColor}>${tokenStatus}</uui-tag>
              <uui-icon name="icon-navigation-down" aria-hidden="true"></uui-icon>
            </span>
          </summary>

          <div class="connection-body">
            <section class="essentials" aria-labelledby=${`${connection.key}-project-heading`}>
              <div class=${`essentials-header${this.status ? " has-status" : ""}`}>
                <div class="essentials-heading">
                  <h3 id=${`${connection.key}-project-heading`}>${isMock ? "Mock data" : "Project"}</h3>
                </div>
                <div class="action-status" role=${this.status?.type === "error" ? "alert" : "status"} aria-live="polite">
                  ${this.status ? html`<span class=${this.status.type}><uui-icon name=${this.status.type === "success" ? "icon-check" : this.status.type === "error" ? "icon-alert" : "icon-info"}></uui-icon>${this.status.message}</span>` : ""}
                </div>
                <div class="connection-actions">
                  <uui-button
                    look="secondary"
                    label=${testHint}
                    title=${testHint}
                    .state=${this.testing ? "waiting" : undefined}
                    ?disabled=${testDisabled}
                    @click=${() => this.#dispatch("test-connection")}>Test connection</uui-button>
                  <uui-button look="secondary" color="danger" label="Remove connection" @click=${() => this.#dispatch("remove-connection")}>Remove</uui-button>
                </div>
              </div>
              ${isMock ? html`
                <p class="section-intro mock-description">${mockScenario?.description ?? "Deterministic analytics data."} This connection never contacts Vercel.</p>
              ` : html`
                <div class="fields two-columns">
                  ${this.#field("Vercel project ID", "projectId", connection.projectId, undefined, this.errors.projectId)}
                  ${this.#teamReferenceField(teamReference(connection), this.errors.team)}
                </div>
              `}
            </section>

            ${isMock ? "" : html`<details class="config-section token-section">
              <summary><span>Token override</span><small>${connection.hasAccessTokenOverride ? "Configured on the server" : connection.hasAccessToken ? "Using shared token" : "Optional"}</small></summary>
              <div class="config-content token-content">
                <p>
                  Optional. Set a connection-specific token only when this project cannot use the shared token.
                  <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noopener noreferrer" aria-label="Create a Vercel access token (opens in a new tab)">
                    Create a Vercel access token<uui-icon name="icon-out" aria-hidden="true"></uui-icon>
                  </a>
                </p>
                <div class="token-key"><code>VercelAnalytics__ConnectionAccessTokens__${connection.key}</code><uui-button compact look="secondary" label="Copy access token setting name" @click=${this.#copyTokenKey}>${this._tokenCopied ? "Copied" : "Copy"}</uui-button></div>
              </div>
            </details>`}

            <details class="config-section">
              <summary><span>Page analytics</span><small>${this.#mappingSummary()}</small></summary>
              <div class="config-content mapping-content">
                <p class="section-intro">Optional. Select the Umbraco site roots that use this Vercel project. Leave empty for global analytics only.</p>
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
          </div>
        </details>
      </uui-box>
    `;
  }

  #field(
    label: string,
    field: "projectId",
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

  #teamReferenceField(value: string, error?: string) {
    const id = `${this.connection.key}-team-reference`;
    return html`
      <uui-form-layout-item>
        <uui-label slot="label" for=${id}>Team ID or slug</uui-label>
        <div class="field-control">
          <uui-input
            id=${id}
            name="teamReference"
            label="Team ID or slug"
            .value=${value}
            maxlength="200"
            aria-invalid=${error ? "true" : "false"}
            aria-describedby=${`${id}-${error ? "error" : "description"}`}
            @input=${this.#teamReference}></uui-input>
          <span id=${`${id}-${error ? "error" : "description"}`} class=${error ? "field-error" : "field-description"}>
            ${error ? html`<uui-icon name="icon-alert" aria-hidden="true"></uui-icon>${error}` : "Leave empty for a personal project."}
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
    .connection-summary { align-items: center; appearance: none; background: transparent; border: 0; color: inherit; cursor: pointer; display: flex; font: inherit; gap: var(--uui-size-space-5); inline-size: 100%; justify-content: space-between; min-block-size: 4rem; padding: var(--uui-size-space-4) var(--uui-size-space-5); text-align: start; }
    .connection-summary:hover { background: color-mix(in srgb, var(--uui-color-interactive) 3%, var(--uui-color-surface)); }
    .connection-summary:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .summary-copy { display: grid; gap: var(--uui-size-space-1); min-inline-size: 0; }
    .summary-copy strong { font-size: var(--uui-type-h5-size); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .summary-copy > span { color: var(--uui-color-text-alt); overflow-wrap: anywhere; }
    .summary-state { align-items: center; display: flex; flex: 0 0 auto; gap: var(--uui-size-space-3); }
    .connection-shell[open] .summary-state > uui-icon { transform: rotate(180deg); }
    .connection-body { border-top: 1px solid var(--uui-color-border); padding: 0 var(--uui-size-space-5) var(--uui-size-space-4); }
    .essentials { padding: var(--uui-size-space-4) 0 var(--uui-size-space-5); }
    .essentials-header { align-items: center; display: grid; gap: var(--uui-size-space-4); grid-template-areas: "heading status actions"; grid-template-columns: auto minmax(0, 1fr) auto; margin-block-end: var(--uui-size-space-4); }
    .essentials-heading { grid-area: heading; min-inline-size: 0; }
    .essentials-heading h3 { font-size: var(--uui-type-h5-size); margin: 0; }
    .connection-actions { align-items: center; display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: var(--uui-size-space-3); grid-area: actions; justify-content: flex-end; }
    .action-status { grid-area: status; justify-self: end; min-inline-size: 0; }
    .action-status:empty { display: none; }
    .action-status span { align-items: center; display: flex; gap: var(--uui-size-space-2); max-inline-size: 48ch; overflow-wrap: anywhere; text-align: end; }
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
    code { font-family: var(--uui-font-monospace); overflow-wrap: anywhere; }
    .mapping-content .fields { max-inline-size: 32rem; }
    .document-types { margin-top: var(--uui-size-space-4); }
    .toggle-help { margin-bottom: 0; }
    .field-control { display: grid; gap: var(--uui-size-space-2); }
    .field-description { color: var(--uui-color-text); font-size: var(--uui-type-small-size); }
    .field-error { align-items: center; color: var(--uui-color-danger-standalone); display: flex; gap: var(--uui-size-space-1); }
    uui-input { inline-size: 100%; }
    uui-input[aria-invalid="true"] { --uui-color-border: var(--uui-color-danger); }
    @container (max-width: 48rem) {
      .two-columns { grid-template-columns: 1fr; }
      .connection-summary { align-items: flex-start; }
      .summary-state { flex-wrap: wrap; justify-content: flex-end; }
      .essentials-header { grid-template-areas: "heading actions"; grid-template-columns: minmax(0, 1fr) auto; }
      .essentials-header.has-status { grid-template-areas: "heading actions" "status status"; }
      .action-status { justify-self: start; }
      .action-status span { text-align: start; }
    }
    @container (max-width: 34rem) {
      .connection-summary { align-items: stretch; flex-direction: column; }
      .essentials-header { align-items: stretch; grid-template-areas: "heading" "actions"; grid-template-columns: 1fr; }
      .essentials-header.has-status { grid-template-areas: "heading" "status" "actions"; }
      .summary-state { justify-content: flex-start; }
      .connection-actions { justify-content: flex-start; }
      .config-section > summary { align-items: flex-start; flex-wrap: wrap; }
      .config-section > summary small { margin-inline-start: 0; }
      .token-key { align-items: stretch; flex-direction: column; }
    }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-connection-editor": VercelAnalyticsConnectionEditorElement;
  }
}
