export function targetTabIndex(event: KeyboardEvent, tabs: ReadonlyArray<HTMLButtonElement>): number {
  const currentIndex = tabs.indexOf(event.currentTarget as HTMLButtonElement);
  switch (event.key) {
    case "Home":
      return 0;
    case "End":
      return tabs.length - 1;
    case "ArrowLeft":
      return (currentIndex - 1 + tabs.length) % tabs.length;
    case "ArrowRight":
      return (currentIndex + 1) % tabs.length;
    default:
      return currentIndex;
  }
}
