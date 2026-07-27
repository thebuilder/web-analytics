export function targetTabIndex(event: KeyboardEvent, tabs: ReadonlyArray<HTMLButtonElement>): number {
  const currentIndex = tabs.indexOf(event.currentTarget as HTMLButtonElement);
  if (event.key === "Home") return 0;
  if (event.key === "End") return tabs.length - 1;
  return event.key === "ArrowLeft"
    ? (currentIndex - 1 + tabs.length) % tabs.length
    : (currentIndex + 1) % tabs.length;
}
