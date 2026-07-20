import { describe, expect, it } from "vitest";
import type { AnalyticsSettingsResponse } from "../api/types.gen.js";
import {
  createSettingsUpdate,
  parseTeamReference,
  teamReference,
  validateConnection,
  validateEditableSettings,
} from "./settings-model.js";

const settings = (): AnalyticsSettingsResponse => ({
  enabled: true,
  providerTokens: [{ provider: "Vercel", hasAccessToken: false }, { provider: "Plausible", hasAccessToken: false }],
  canCreateMockConnections: false,
  defaultRangeDays: 30,
  cacheDuration: "00:05:00",
  connections: [{
    key: "11111111-1111-1111-1111-111111111111",
    displayName: "Main",
    provider: "Vercel",
    projectId: "project",
    team: null,
    siteId: "",
    documentRootKeys: [],
    enableAllDocumentTypes: false,
    enabledDocumentTypeKeys: [],
    hasAccessToken: false,
    hasAccessTokenOverride: false,
    mockScenario: null,
  }],
});

describe("analytics settings model", () => {
  it("requires a project ID for Vercel connections", () => {
    const connection = settings().connections[0];
    connection.projectId = "";

    expect(validateConnection(connection)).toEqual({
      projectId: "Enter the Vercel project ID.",
    });
  });

  it("accepts typed mock scenarios without a project ID", () => {
    const model = settings();
    model.connections[0].projectId = "";
    model.connections[0].mockScenario = "Complete";

    expect(validateConnection(model.connections[0])).toEqual({});
    expect(createSettingsUpdate(model).connections[0].mockScenario).toBe("Complete");
  });

  it("allows global-only connections without mappings", () => {
    expect(validateEditableSettings(settings())).toBeUndefined();
  });

  it("allows analytics to stay enabled without connections", () => {
    const model = settings();
    model.connections = [];

    expect(validateEditableSettings(model)).toBeUndefined();
    expect(createSettingsUpdate(model)).toMatchObject({ enabled: true, connections: [] });
  });

  it("returns field-level errors for missing connection essentials", () => {
    const model = settings();
    model.connections[0].projectId = "";

    expect(validateConnection(model.connections[0])).toEqual({
      projectId: "Enter the Vercel project ID.",
    });
  });

  it("normalizes the team ID or slug into one API field", () => {
    expect(parseTeamReference(" team_example ")).toEqual({ team: "team_example" });
    expect(parseTeamReference("my-team")).toEqual({ team: "my-team" });
    expect(parseTeamReference("  ")).toEqual({ team: null });
  });

  it("reads the configured team reference", () => {
    const connection = settings().connections[0];
    connection.team = "my-team";
    expect(teamReference(connection)).toBe("my-team");
    connection.team = "team_example";
    expect(teamReference(connection)).toBe("team_example");
  });

  it("clears explicit selections when all document types is enabled", () => {
    const model = settings();
    model.connections[0].enableAllDocumentTypes = true;
    model.connections[0].enabledDocumentTypeKeys = ["11111111-1111-1111-1111-111111111111"];
    expect(createSettingsUpdate(model).connections[0].enabledDocumentTypeKeys).toEqual([]);
  });

  it("keeps the immutable connection key in updates", () => {
    const model = settings();

    expect(createSettingsUpdate(model).connections[0].key).toBe(model.connections[0].key);
  });
});
