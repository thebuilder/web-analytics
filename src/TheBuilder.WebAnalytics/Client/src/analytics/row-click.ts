// Links, buttons and focusable elements in a row handle their own clicks, and finishing a text selection
// is not a click on the row. Only targets inside the row count: the backoffice wraps tables in focusable
// scroll containers. Call this from the row's own click listener.
export function isPlainRowClick(event: Event, root: ShadowRoot | null): boolean {
  const path = event.composedPath();
  const insideRow = path.slice(0, path.indexOf(event.currentTarget as EventTarget));
  if (insideRow.some((target) => target instanceof HTMLElement && target.matches("a, button, [tabindex]"))) return false;
  const shadowRoot = root as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
  return !(shadowRoot?.getSelection?.() ?? document.getSelection())?.toString();
}
