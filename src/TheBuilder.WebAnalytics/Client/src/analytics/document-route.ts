import type { AnalyticsDocumentRoute } from "../api/types.gen.js";

export function activeDocumentRoute(
  routes: AnalyticsDocumentRoute[],
  culture?: string,
  connection?: string,
): AnalyticsDocumentRoute | undefined {
  const connectionRoutes = connection ? routes.filter((route) => route.connection === connection) : routes;
  if (culture) {
    return connectionRoutes.find((route) => route.culture.toLocaleLowerCase() === culture.toLocaleLowerCase());
  }

  return connectionRoutes.find((route) => route.isCurrent) ?? connectionRoutes[0];
}

export function workspaceAnalyticsCulture(
  variantCulture?: string | null,
  appCulture?: string | null,
): string | undefined {
  const activeCulture = variantCulture?.trim();
  if (activeCulture && activeCulture.toLocaleLowerCase() !== "invariant") return activeCulture;

  return appCulture?.trim() || undefined;
}
