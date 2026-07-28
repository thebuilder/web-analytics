import { describe, expect, it } from "vitest";
import { targetTabIndex } from "./tab-keyboard.js";

const tabs = [{}, {}, {}] as HTMLButtonElement[];
const keyboardEvent = (key: string, currentTarget = tabs[1]) =>
  ({ key, currentTarget }) as unknown as KeyboardEvent;

describe("targetTabIndex", () => {
  it("moves only for supported tab navigation keys", () => {
    expect(targetTabIndex(keyboardEvent("ArrowLeft"), tabs)).toBe(0);
    expect(targetTabIndex(keyboardEvent("ArrowRight"), tabs)).toBe(2);
    expect(targetTabIndex(keyboardEvent("Home"), tabs)).toBe(0);
    expect(targetTabIndex(keyboardEvent("End"), tabs)).toBe(2);
  });

  it("keeps the current tab for other keys", () => {
    expect(targetTabIndex(keyboardEvent("Escape"), tabs)).toBe(1);
  });
});
