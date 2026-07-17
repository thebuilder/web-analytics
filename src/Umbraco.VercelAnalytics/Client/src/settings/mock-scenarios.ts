import type { MockAnalyticsScenario } from "../api/types.gen.js";

export type MockScenarioDefinition = Readonly<{
  id: MockAnalyticsScenario;
  name: string;
  description: string;
}>;

export const MOCK_SCENARIOS = [
  { id: "Complete", name: "Complete dashboard", description: "Traffic, audience, UTM, flags, and events." },
  { id: "Utm", name: "UTM campaigns", description: "Populated source, medium, campaign, term, and content reports." },
  { id: "Flags", name: "Feature flags", description: "Flag keys with drill-down values and traffic totals." },
  { id: "Events", name: "Custom events", description: "Events with searchable properties and drill-down values." },
] as const satisfies ReadonlyArray<MockScenarioDefinition>;

export function getMockScenario(
  scenario: MockAnalyticsScenario | null | undefined,
): MockScenarioDefinition | undefined {
  return MOCK_SCENARIOS.find((candidate) => candidate.id === scenario);
}
