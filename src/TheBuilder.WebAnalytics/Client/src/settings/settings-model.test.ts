import { describe, expect, it } from "vitest";
import type { AnalyticsSettingsResponse } from "../api/types.gen.js";
import {
  createSettingsUpdate,
  parseTeamReference,
  teamReference,
  validateConnection,
  validateEditableSettings,
} from "./settings-model.js";
import { providerDescriptor } from "./provider-identity.js";

const settings = (): AnalyticsSettingsResponse => ({
  packageVersion: "0.3.0",
  enabled: true,
  providers: [
    {
      provider: "Vercel",
      description: "Projects using Vercel Web Analytics",
      logoSlug: "vercel",
      capabilities: { dimensions: ["RequestPath", "EventName"], events: true, eventDetails: true, eventProperties: false, globalEventFiltering: false, globalEventPropertyFiltering: false, flags: true, breakdownOrdering: false },
      identifier: { key: "projectId", label: "Vercel project ID", description: "Use the project ID from your Vercel project settings.", requiredMessage: "a Vercel project ID" },
      team: { key: "team", label: "Team ID or slug", description: "Optional team slug or ID for projects owned by a Vercel team." },
      credential: { label: "access token", description: "Configure a Vercel access token in the server settings.", documentationUrl: "https://vercel.com/docs/rest-api" },
      eventProperties: null,
    },
    {
      provider: "Plausible",
      description: "Sites using Plausible Analytics",
      logoSlug: "plausible",
      capabilities: { dimensions: ["RequestPath", "EventName"], events: true, eventDetails: true, eventProperties: true, globalEventFiltering: true, globalEventPropertyFiltering: true, flags: false, breakdownOrdering: true },
      identifier: { key: "siteId", label: "Plausible site ID", description: "Use the domain configured in your Plausible site settings.", requiredMessage: "a Plausible site ID" },
      team: null,
      credential: { label: "Stats API key", description: "Configure a Plausible Stats API key in the server settings.", documentationUrl: "https://plausible.io/docs/stats-api" },
      eventProperties: { label: "event properties", description: "Optional custom event property names configured for this Plausible site.", maximumNames: 20, maximumNameLength: 100 },
    },
  ],
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
    eventPropertyNames: [],
    enableEvents: true,
    enableFlags: true,
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

    expect(validateConnection(connection, providerDescriptor(settings(), connection.provider))).toEqual({
      projectId: "Enter a Vercel project ID.",
    });
  });

  it("accepts typed mock scenarios without a project ID", () => {
    const model = settings();
    model.connections[0].projectId = "";
    model.connections[0].mockScenario = "Complete";

    expect(validateConnection(model.connections[0], providerDescriptor(model, model.connections[0].provider))).toEqual({});
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

    expect(validateConnection(model.connections[0], providerDescriptor(model, model.connections[0].provider))).toEqual({
      projectId: "Enter a Vercel project ID.",
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

  it("preserves enabled dashboard reports in updates", () => {
    const model = settings();
    model.connections[0].enableEvents = false;

    expect(createSettingsUpdate(model).connections[0]).toMatchObject({
      enableEvents: false,
      enableFlags: true,
    });
  });

  it("validates and serializes Plausible event property names", () => {
    const model = settings();
    const connection = model.connections[0];
    connection.provider = "Plausible";
    connection.projectId = "";
    connection.siteId = "example.com";
    connection.eventPropertyNames = ["locale", "title"];

    expect(validateConnection(connection, providerDescriptor(model, connection.provider))).toEqual({});
    expect(createSettingsUpdate(model).connections[0].eventPropertyNames).toEqual(["locale", "title"]);

    connection.eventPropertyNames = Array.from({ length: 21 }, (_, index) => `property-${index}`);
    expect(validateConnection(connection, providerDescriptor(model, connection.provider)).eventPropertyNames).toBe("Add no more than 20 event properties.");

    connection.enableEvents = false;
    expect(validateConnection(connection, providerDescriptor(model, connection.provider))).toEqual({});
  });
});
