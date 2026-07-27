export function openDialog(host: HTMLElement): void {
  host.shadowRoot?.querySelector("dialog")?.showModal();
}

export function closeDialog(host: HTMLElement): void {
  host.shadowRoot?.querySelector("dialog")?.close();
}

export function notifyDialogClosed(host: HTMLElement, eventName: string): void {
  host.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true }));
}

export function cancelDialog(event: Event, host: HTMLElement): void {
  event.preventDefault();
  closeDialog(host);
}

export function searchInputValue(event: Event): string {
  return String((event.target as HTMLElement & { value?: unknown }).value ?? "");
}

export function notifyDialogSearch(host: HTMLElement, eventName: string, search: string): void {
  host.dispatchEvent(new CustomEvent(eventName, {
    bubbles: true,
    composed: true,
    detail: { search: search.trim() },
  }));
}
