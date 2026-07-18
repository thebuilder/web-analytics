export const manifests: Array<UmbExtensionManifest> = [
  {
    name: "Web Analytics Entrypoint",
    alias: "TheBuilder.WebAnalytics.Entrypoint",
    type: "backofficeEntryPoint",
    js: () => import("./entrypoint.js"),
  },
];
