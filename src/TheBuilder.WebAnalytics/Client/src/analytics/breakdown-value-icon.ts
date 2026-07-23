import type { AnalyticsDimension } from "../api/types.gen.js";

const BROWSER_ICON_PATHS = new Map<string, string>([
  ["brave", "browsers/brave.svg"],
  ["chrome", "browsers/chrome.svg"],
  ["chrome mobile", "browsers/chrome.svg"],
  ["duckduckgo", "browsers/duckduckgo.svg"],
  ["duckduckgo privacy browser", "browsers/duckduckgo.svg"],
  ["ecosia", "browsers/ecosia.svg"],
  ["edge", "browsers/edge.svg"],
  ["firefox", "browsers/firefox.svg"],
  ["jio", "browsers/jio.svg"],
  ["jiosphere", "browsers/jio.svg"],
  ["microsoft edge", "browsers/edge.svg"],
  ["mobile firefox", "browsers/firefox.svg"],
  ["mobile safari", "browsers/safari.svg"],
  ["opera", "browsers/opera.svg"],
  ["opera gx", "browsers/opera-gx.svg"],
  ["opera touch", "browsers/opera.svg"],
  ["qwant", "browsers/qwant.svg"],
  ["qwant mobile", "browsers/qwant.svg"],
  ["safari", "browsers/safari.svg"],
  ["samsung browser", "browsers/samsung-browser.svg"],
  ["samsung internet", "browsers/samsung-browser.svg"],
  ["sberbrowser", "browsers/sberbank.svg"],
  ["vivo", "browsers/vivo.svg"],
  ["vivo browser", "browsers/vivo.svg"],
  ["yandex", "browsers/yandex.svg"],
  ["yandex browser", "browsers/yandex.svg"],
]);

const OPERATING_SYSTEM_ICON_PATHS = new Map<string, string>([
  ["android", "operating-systems/android.svg"],
  ["chrome os", "browsers/chrome.svg"],
  ["chromeos", "browsers/chrome.svg"],
  ["gnu/linux", "operating-systems/linux.svg"],
  ["ios", "operating-systems/ios.svg"],
  ["ipados", "operating-systems/apple.svg"],
  ["linux", "operating-systems/linux.svg"],
  ["mac", "operating-systems/apple.svg"],
  ["mac os", "operating-systems/apple.svg"],
  ["mac os x", "operating-systems/apple.svg"],
  ["macos", "operating-systems/apple.svg"],
  ["ubuntu", "operating-systems/ubuntu.svg"],
  ["windows", "operating-systems/windows.svg"],
  ["windows 10", "operating-systems/windows.svg"],
  ["windows 11", "operating-systems/windows.svg"],
]);

const ICON_PATHS_BY_DIMENSION: Partial<Record<AnalyticsDimension, ReadonlyMap<string, string>>> = {
  BrowserName: BROWSER_ICON_PATHS,
  OsName: OPERATING_SYSTEM_ICON_PATHS,
};

const NATIVE_ICON_NAMES = new Map<string, string>([
  ["desktop", "icon-desktop"],
  ["mobile", "icon-mobile"],
  ["tablet", "icon-ipad"],
]);

const BREAKDOWN_ICON_ROOT = "/App_Plugins/TheBuilder.WebAnalytics/icons/";

export type BreakdownValueIcon =
  | { kind: "asset"; src: string }
  | { kind: "native"; name: string };

export function breakdownValueIcon(dimension: AnalyticsDimension | undefined, value: string): BreakdownValueIcon | undefined {
  const normalizedValue = value.trim().toLowerCase();
  const asset = dimension ? ICON_PATHS_BY_DIMENSION[dimension]?.get(normalizedValue) : undefined;
  if (asset) return { kind: "asset", src: `${BREAKDOWN_ICON_ROOT}${asset}` };

  const nativeIcon = dimension === "DeviceType" ? NATIVE_ICON_NAMES.get(normalizedValue) : undefined;
  return nativeIcon ? { kind: "native", name: nativeIcon } : undefined;
}
