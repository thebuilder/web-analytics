import { describe, expect, it } from "vitest";
import { breakdownValueIcon } from "./breakdown-value-icon.js";

describe("breakdownValueIcon", () => {
  it("uses local coloured marks for recognised browser values", () => {
    expect(breakdownValueIcon("BrowserName", "Chrome")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/browsers/chrome.svg" });
    expect(breakdownValueIcon("BrowserName", "Microsoft Edge")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/browsers/edge.svg" });
    expect(breakdownValueIcon("BrowserName", "Opera GX")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/browsers/opera-gx.svg" });
    expect(breakdownValueIcon("BrowserName", "SberBrowser")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/browsers/sberbank.svg" });
  });

  it("uses local platform marks for recognised operating systems", () => {
    expect(breakdownValueIcon("OsName", "Mac OS X")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/operating-systems/apple.svg" });
    expect(breakdownValueIcon("OsName", "iOS")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/operating-systems/ios.svg" });
    expect(breakdownValueIcon("OsName", "Windows")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/operating-systems/windows.svg" });
    expect(breakdownValueIcon("OsName", "GNU/Linux")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/operating-systems/linux.svg" });
    expect(breakdownValueIcon("OsName", "Chrome OS")).toEqual({ kind: "asset", src: "/App_Plugins/TheBuilder.WebAnalytics/icons/browsers/chrome.svg" });
  });

  it("uses native Umbraco marks for recognised device values", () => {
    expect(breakdownValueIcon("DeviceType", "Desktop")).toEqual({ kind: "native", name: "icon-desktop" });
    expect(breakdownValueIcon("DeviceType", "Mobile")).toEqual({ kind: "native", name: "icon-mobile" });
    expect(breakdownValueIcon("DeviceType", "Tablet")).toEqual({ kind: "native", name: "icon-ipad" });
  });

  it("leaves unrecognised values for the generic fallback", () => {
    expect(breakdownValueIcon("BrowserName", "Mobile App")).toBeUndefined();
    expect(breakdownValueIcon("OsName", "(not set)")).toBeUndefined();
    expect(breakdownValueIcon("DeviceType", "Unknown")).toBeUndefined();
  });
});
