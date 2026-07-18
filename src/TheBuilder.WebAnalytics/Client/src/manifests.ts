export const manifests: Array<UmbExtensionManifest> = [
  {
    type: "condition",
    alias: "TheBuilder.WebAnalytics.Condition.AnalyticsEnabled",
    name: "Web Analytics Enabled Condition",
    api: () => import("./section/analytics-enabled.condition.js"),
  },
  {
    type: "section",
    alias: "TheBuilder.WebAnalytics.Section",
    name: "Web Analytics Section",
    meta: { label: "Analytics", pathname: "analytics" },
    conditions: [{ alias: "TheBuilder.WebAnalytics.Condition.AnalyticsEnabled" }],
  },
  {
    type: "sectionView",
    alias: "TheBuilder.WebAnalytics.SectionView",
    name: "Web Analytics Section View",
    js: () => import("./section/analytics-section.element.js"),
    meta: { label: "Analytics", pathname: "overview", icon: "icon-chart-curve" },
    conditions: [{ alias: "Umb.Condition.SectionAlias", match: "TheBuilder.WebAnalytics.Section" }],
  },
  {
    type: "dashboard",
    alias: "TheBuilder.WebAnalytics.SettingsDashboard",
    name: "Web Analytics Settings Dashboard",
    js: () => import("./settings/settings-dashboard.element.js"),
    weight: 25,
    meta: { label: "Web Analytics", pathname: "vercel-analytics" },
    conditions: [
      { alias: "Umb.Condition.SectionAlias", match: "Umb.Section.Settings" },
      { alias: "Umb.Condition.CurrentUser.IsAdmin" },
    ],
  },
  {
    type: "condition",
    alias: "TheBuilder.WebAnalytics.Condition.DocumentAnalytics",
    name: "Document Analytics Availability Condition",
    api: () => import("./workspace/document-analytics.condition.js"),
  },
  {
    type: "workspaceView",
    alias: "TheBuilder.WebAnalytics.DocumentWorkspaceView",
    name: "Web Analytics Document Workspace View",
    js: () => import("./workspace/analytics-workspace.element.js"),
    meta: { label: "Analytics", pathname: "analytics", icon: "icon-chart-curve" },
    conditions: [
      { alias: "Umb.Condition.WorkspaceAlias", match: "Umb.Workspace.Document" },
      { alias: "TheBuilder.WebAnalytics.Condition.DocumentAnalytics" },
    ],
  },
];
