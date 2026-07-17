import type {
  AnalyticsConnectionSettingsResponse,
  AnalyticsSettingsResponse,
  UpdateAnalyticsSettingsRequest,
} from "../api/types.gen.js";

export type ConnectionValidationErrors = Partial<Record<"projectId" | "team", string>>;

export function teamReference(connection: AnalyticsConnectionSettingsResponse): string {
  return connection.team?.trim() || "";
}

export function parseTeamReference(value: string): Pick<AnalyticsConnectionSettingsResponse, "team"> {
  return { team: value.trim() || null };
}

export function validateConnection(connection: AnalyticsConnectionSettingsResponse): ConnectionValidationErrors {
  const errors: ConnectionValidationErrors = {};
  if (connection.mockScenario == null && !connection.projectId.trim()) errors.projectId = "Enter the Vercel project ID.";
  return errors;
}

export function validateEditableSettings(settings: AnalyticsSettingsResponse): string | undefined {
  if (settings.enabled && settings.connections.length === 0) return "Add a connection before enabling analytics.";
  for (const connection of settings.connections) {
    const errors = validateConnection(connection);
    if (errors.projectId) return `Complete the required fields for “${connection.displayName || connection.projectId || "New connection"}”.`;
    if (errors.team) return `Fix the team ownership for “${connection.displayName || connection.projectId || "New connection"}”.`;
  }
  return undefined;
}

export function createSettingsUpdate(settings: AnalyticsSettingsResponse): UpdateAnalyticsSettingsRequest {
  return {
    enabled: settings.enabled,
    defaultRangeDays: settings.defaultRangeDays,
    cacheDuration: settings.cacheDuration,
    connections: settings.connections.map((connection) => ({
      key: connection.key,
      displayName: connection.displayName,
      projectId: connection.projectId,
      team: connection.team,
      mockScenario: connection.mockScenario,
      documentRootKeys: connection.documentRootKeys,
      enableAllDocumentTypes: connection.enableAllDocumentTypes,
      enabledDocumentTypeKeys: connection.enableAllDocumentTypes ? [] : connection.enabledDocumentTypeKeys,
    })),
  };
}
