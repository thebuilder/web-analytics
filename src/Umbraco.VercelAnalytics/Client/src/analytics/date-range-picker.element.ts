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
import type { UUIInputElement } from "@umbraco-cms/backoffice/external/uui";
import {
  calendarMonthDays,
  dateRangeForPreset,
  formatAnalyticsRangeLabel,
  normalizeCustomRange,
  shiftCalendarMonth,
  type AnalyticsCalendarDay,
  type AnalyticsDateRange,
  type DatePreset,
} from "./date-range.js";

export type AnalyticsDateRangeChangeDetail = {
  preset: DatePreset;
  range: AnalyticsDateRange;
};

const PRESETS: ReadonlyArray<{ value: Exclude<DatePreset, "custom">; label: string }> = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last 12 months" },
];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

@customElement("vercel-analytics-date-range-picker")
export class VercelAnalyticsDateRangePickerElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) range: AnalyticsDateRange = dateRangeForPreset(30);
  @property({ attribute: false }) preset: DatePreset = 30;

  @state() private _draftFrom = this.range.from;
  @state() private _draftTo = this.range.to;
  @state() private _viewMonth = this.range.to;
  @state() private _selectingEnd = false;

  get #details(): HTMLDetailsElement | null {
    return this.shadowRoot?.querySelector<HTMLDetailsElement>("details") ?? null;
  }

  #onDocumentClick = (event: MouseEvent): void => {
    if (this.#details?.open && !event.composedPath().includes(this)) this.#close();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.#onDocumentClick);
  }

  override disconnectedCallback(): void {
    document.removeEventListener("click", this.#onDocumentClick);
    super.disconnectedCallback();
  }

  #resetDraft(): void {
    this._draftFrom = this.range.from;
    this._draftTo = this.range.to;
    this._viewMonth = this.range.to;
    this._selectingEnd = false;
  }

  #onToggle(event: Event): void {
    if ((event.currentTarget as HTMLDetailsElement).open) this.#resetDraft();
  }

  #close(): void {
    if (this.#details) this.#details.open = false;
  }

  #onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    this.#close();
    this.shadowRoot?.querySelector<HTMLElement>(".trigger")?.focus();
  }

  #commit(preset: DatePreset, range: AnalyticsDateRange): void {
    this.dispatchEvent(new CustomEvent<AnalyticsDateRangeChangeDetail>("analytics-date-range-change", {
      bubbles: true,
      composed: true,
      detail: { preset, range },
    }));
    this.#close();
  }

  #selectPreset(preset: Exclude<DatePreset, "custom">): void {
    this.#commit(preset, dateRangeForPreset(preset));
  }

  #selectDay(date: string): void {
    if (!this._selectingEnd) {
      this._draftFrom = date;
      this._draftTo = date;
      this._selectingEnd = true;
      return;
    }

    if (date < this._draftFrom) {
      this._draftTo = this._draftFrom;
      this._draftFrom = date;
    } else {
      this._draftTo = date;
    }
    this._selectingEnd = false;
  }

  #onDateInput(field: "from" | "to", event: Event): void {
    const value = (event.target as UUIInputElement).value as string;
    if (field === "from") this._draftFrom = value;
    else this._draftTo = value;
    if (value) this._viewMonth = value;
    this._selectingEnd = false;
  }

  #applyCustomRange(): void {
    const range = normalizeCustomRange(this._draftFrom, this._draftTo);
    if (range) this.#commit("custom", range);
  }

  #renderDay(day: AnalyticsCalendarDay) {
    const selectedStart = day.date === this._draftFrom;
    const selectedEnd = day.date === this._draftTo;
    const inRange = day.date >= this._draftFrom && day.date <= this._draftTo;
    const className = [
      "calendar-day",
      day.outsideMonth ? "outside-month" : "",
      inRange ? "in-range" : "",
      selectedStart ? "selected-start" : "",
      selectedEnd ? "selected-end" : "",
    ].filter(Boolean).join(" ");
    const label = new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${day.date}T00:00:00Z`));

    return html`
      <button
        class=${className}
        type="button"
        aria-label=${label}
        aria-pressed=${selectedStart || selectedEnd ? "true" : "false"}
        aria-current=${day.today ? "date" : "false"}
        @click=${() => this.#selectDay(day.date)}>${day.day}</button>
    `;
  }

  render() {
    const rangeLabel = formatAnalyticsRangeLabel(this.range, this.preset);
    const monthDate = new Date(`${this._viewMonth}T00:00:00Z`);
    const monthLabel = new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(monthDate);
    const validCustomRange = normalizeCustomRange(this._draftFrom, this._draftTo);

    return html`
      <details @toggle=${(event: Event) => this.#onToggle(event)}>
        <summary class="trigger" aria-label=${`Date range: ${rangeLabel}`} aria-haspopup="dialog">
          <span class="trigger-content">
            <uui-icon name="icon-calendar" aria-hidden="true"></uui-icon>
            <span>${rangeLabel}</span>
            <uui-icon name="icon-navigation-down" aria-hidden="true"></uui-icon>
          </span>
        </summary>

        <div
          class="popover-panel"
          id="analytics-date-popover"
          role="dialog"
          aria-label="Choose analytics date range"
          @keydown=${(event: KeyboardEvent) => this.#onKeyDown(event)}>
          <umb-popover-layout>
          <div class="picker">
            <nav class="presets" aria-label="Date range presets">
              ${PRESETS.map((item) => html`
                <button
                  type="button"
                  aria-current=${this.preset === item.value ? "true" : "false"}
                  @click=${() => this.#selectPreset(item.value)}>${item.label}</button>
              `)}
              <span class="custom-label" aria-current=${this.preset === "custom" ? "true" : "false"}>Custom range</span>
            </nav>

            <section class="calendar" aria-label="Custom date range">
              <div class="calendar-header">
                <strong>${monthLabel}</strong>
                <div class="month-actions">
                  <uui-button
                    compact
                    look="secondary"
                    label="Previous month"
                    @click=${() => { this._viewMonth = shiftCalendarMonth(this._viewMonth, -1); }}>
                    <uui-icon name="icon-navigation-left" aria-hidden="true"></uui-icon>
                  </uui-button>
                  <uui-button
                    compact
                    look="secondary"
                    label="Next month"
                    @click=${() => { this._viewMonth = shiftCalendarMonth(this._viewMonth, 1); }}>
                    <uui-icon name="icon-navigation-right" aria-hidden="true"></uui-icon>
                  </uui-button>
                </div>
              </div>

              <div class="weekdays" aria-hidden="true">
                ${WEEKDAYS.map((day) => html`<abbr title=${day}>${day.slice(0, 1)}</abbr>`)}
              </div>
              <div class="calendar-grid">
                ${calendarMonthDays(this._viewMonth).map((day) => this.#renderDay(day))}
              </div>

              <div class="date-inputs">
                <label>
                  <span>From</span>
                  <uui-input label="From date" type="date" .value=${this._draftFrom} @change=${(event: Event) => this.#onDateInput("from", event)}></uui-input>
                </label>
                <label>
                  <span>To</span>
                  <uui-input label="To date" type="date" .value=${this._draftTo} @change=${(event: Event) => this.#onDateInput("to", event)}></uui-input>
                </label>
              </div>

              <div class="picker-footer">
                <span class="selection-hint" aria-live="polite">
                  ${this._selectingEnd ? "Choose an end date" : ""}
                </span>
                <uui-button
                  look="primary"
                  label="Apply custom date range"
                  ?disabled=${!validCustomRange}
                  @click=${this.#applyCustomRange}>Apply</uui-button>
              </div>
            </section>
          </div>
          </umb-popover-layout>
        </div>
      </details>
    `;
  }

  static styles = [UmbTextStyles, css`
    :host { display: block; min-inline-size: 0; }
    details { position: relative; }
    .trigger { align-items: center; appearance: none; background: var(--uui-color-surface); border: 1px solid color-mix(in srgb, var(--uui-color-border) 55%, var(--uui-color-text-alt)); border-radius: var(--uui-border-radius); color: var(--uui-color-text); cursor: pointer; display: flex; font: inherit; font-weight: 600; max-inline-size: 100%; min-block-size: 2.5rem; min-inline-size: 11rem; padding: var(--uui-size-space-2) var(--uui-size-space-3); }
    .trigger::-webkit-details-marker { display: none; }
    .trigger:hover { background: var(--uui-color-surface-alt); border-color: var(--uui-color-interactive); }
    .trigger:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: 2px; }
    .trigger-content { align-items: center; display: grid; gap: var(--uui-size-space-3); grid-template-columns: auto minmax(0, 1fr) auto; inline-size: 100%; text-align: left; }
    .trigger-content > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .trigger-content uui-icon { color: var(--uui-color-text-alt); }
    .popover-panel { background: var(--uui-color-surface); border: 1px solid var(--uui-color-border); border-radius: var(--uui-border-radius); box-shadow: var(--uui-shadow-depth-3); inset-block-start: calc(100% + var(--uui-size-space-2)); inset-inline-end: 0; overflow: hidden; position: absolute; z-index: var(--uui-popover-z-index, 1); }
    .picker { display: grid; grid-template-columns: 10rem minmax(19rem, 1fr); inline-size: min(40rem, calc(100vw - (2 * var(--uui-size-space-5)))); max-block-size: min(42rem, calc(100dvh - 6rem)); overflow: auto; }
    .presets { border-inline-end: 1px solid var(--uui-color-border); display: flex; flex-direction: column; padding: var(--uui-size-space-3); }
    .presets button, .custom-label { border-radius: var(--uui-border-radius); box-sizing: border-box; color: var(--uui-color-text); display: block; font: inherit; inline-size: 100%; padding: var(--uui-size-space-3); text-align: left; }
    .presets button { appearance: none; background: transparent; border: 0; cursor: pointer; }
    .presets button:hover { background: var(--uui-color-surface-alt); }
    .presets button:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; }
    .presets button[aria-current="true"], .custom-label[aria-current="true"] { background: var(--uui-color-surface-alt); font-weight: 700; }
    .custom-label { color: var(--uui-color-text-alt); margin-top: var(--uui-size-space-1); }
    .calendar { padding: var(--uui-size-space-5); }
    .calendar-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: var(--uui-size-space-4); }
    .month-actions { display: flex; gap: var(--uui-size-space-1); }
    .weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    .weekdays abbr { color: var(--uui-color-text-alt); font-size: 0.875rem; padding-block: var(--uui-size-space-2); text-align: center; text-decoration: none; }
    .calendar-day { appearance: none; background: transparent; border: 0; color: var(--uui-color-text); cursor: pointer; font: inherit; min-block-size: 2.35rem; padding: 0; position: relative; }
    .calendar-day:hover { background: var(--uui-color-surface-alt); }
    .calendar-day:focus-visible { outline: 2px solid var(--uui-color-selected); outline-offset: -2px; z-index: 1; }
    .calendar-day.outside-month { color: var(--uui-color-text-alt); }
    .calendar-day.in-range { background: color-mix(in srgb, var(--uui-color-selected) 12%, var(--uui-color-surface)); }
    .calendar-day.selected-start, .calendar-day.selected-end { background: var(--uui-color-selected); color: var(--uui-color-selected-contrast); font-weight: 700; }
    .calendar-day.selected-start { border-radius: var(--uui-border-radius) 0 0 var(--uui-border-radius); }
    .calendar-day.selected-end { border-radius: 0 var(--uui-border-radius) var(--uui-border-radius) 0; }
    .calendar-day.selected-start.selected-end { border-radius: var(--uui-border-radius); }
    .date-inputs { border-top: 1px solid var(--uui-color-border); display: grid; gap: var(--uui-size-space-3); grid-template-columns: 1fr 1fr; margin-top: var(--uui-size-space-4); padding-top: var(--uui-size-space-4); }
    .date-inputs label { display: grid; gap: var(--uui-size-space-2); }
    .date-inputs label > span { color: var(--uui-color-text-alt); font-size: 0.875rem; }
    .date-inputs uui-input { inline-size: 100%; }
    .picker-footer { align-items: center; display: flex; gap: var(--uui-size-space-3); justify-content: space-between; margin-top: var(--uui-size-space-4); }
    .selection-hint { color: var(--uui-color-text-alt); font-size: 0.875rem; }
    @media (max-width: 40rem) {
      .picker { grid-template-columns: 1fr; inline-size: calc(100vw - (2 * var(--uui-size-space-3))); }
      .presets { border-bottom: 1px solid var(--uui-color-border); border-inline-end: 0; flex-direction: row; flex-wrap: wrap; gap: var(--uui-size-space-1); }
      .presets button, .custom-label { inline-size: auto; padding: var(--uui-size-space-2) var(--uui-size-space-3); }
      .custom-label { margin-top: 0; }
      .calendar { padding: var(--uui-size-space-4); }
    }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "vercel-analytics-date-range-picker": VercelAnalyticsDateRangePickerElement;
  }
}
