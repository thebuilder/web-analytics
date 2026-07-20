import { html } from "@umbraco-cms/backoffice/external/lit";
import type { AnalyticsProvider } from "../api/types.gen.js";

export type AnalyticsProviderIdentity = {
  provider: AnalyticsProvider;
  description: string;
  identifier: string;
  credential: string;
};

export const ANALYTICS_PROVIDERS: ReadonlyArray<AnalyticsProviderIdentity> = [
  {
    provider: "Vercel",
    description: "Projects using Vercel Web Analytics",
    identifier: "Project ID",
    credential: "access token",
  },
  {
    provider: "Plausible",
    description: "Sites using Plausible Analytics",
    identifier: "Site ID",
    credential: "Stats API key",
  },
];

export function providerIdentity(provider: AnalyticsProvider): AnalyticsProviderIdentity {
  return ANALYTICS_PROVIDERS.find((item) => item.provider === provider) ?? ANALYTICS_PROVIDERS[0];
}

export function providerLogo(provider: AnalyticsProvider) {
  const slug = provider.toLowerCase();
  return html`<img
    class=${`provider-logo ${slug}`}
    src=${`/App_Plugins/TheBuilder.WebAnalytics/icons/providers/${slug}.svg`}
    alt=""
    width="24"
    height="24"
    aria-hidden="true"
    decoding="async"
  />`;
}
