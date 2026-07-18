import type { AnalyticsDocumentRoute } from "../api/types.gen.js";

export function activeDocumentRoute(
  routes: AnalyticsDocumentRoute[],
  culture?: string,
): AnalyticsDocumentRoute | undefined {
  if (culture) {
    return routes.find((route) => route.culture.toLocaleLowerCase() === culture.toLocaleLowerCase());
  }

  return routes.find((route) => route.isCurrent) ?? routes[0];
}

export function workspaceAnalyticsCulture(
  variantCulture?: string | null,
  appCulture?: string | null,
): string | undefined {
  const activeCulture = variantCulture?.trim();
  if (activeCulture && activeCulture.toLocaleLowerCase() !== "invariant") return activeCulture;

  return appCulture?.trim() || undefined;
}
