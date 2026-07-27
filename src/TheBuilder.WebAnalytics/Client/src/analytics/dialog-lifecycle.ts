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
