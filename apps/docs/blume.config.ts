import { defineConfig } from "blume";
import { vercel } from "blume/analytics";
import { custom, filesystem } from "blume/sources";

import { githubReleaseChangelogSource } from "./sources/github-releases";
import { webAnalyticsPackage } from "./umbraco-package";

const site = "https://web-analytics.thebuilder.dk";

export default defineConfig({
  title: webAnalyticsPackage.name,
  description: webAnalyticsPackage.summary,
  logo: {
    image: "/logo.png",
    text: "Web Analytics",
  },
  github: {
    owner: "thebuilder",
    repo: "web-analytics",
    dir: "apps/docs",
  },
  content: {
    sources: [
      filesystem({ root: "docs" }),
      custom(
        githubReleaseChangelogSource({
          owner: "thebuilder",
          repo: "web-analytics",
          site,
        }),
      ),
    ],
  },
  navigation: {
    tabs: [
      // A custom landing page owns "/", so the Docs tab links to the overview
      // while keeping path "/" to stay highlighted across every docs route.
      { label: "Docs", path: "/", href: "/overview" },
      { label: "Changelog", path: "/changelog", href: "/changelog" },
    ],
  },
  redirects: [{ from: "/getting-started", to: "/quickstart", status: 301 }],
  deployment: { site },
  seo: {
    // Package-owned cards are generated into public/og before Blume builds.
    // Disable Blume's generated /og routes so it cannot overwrite them.
    og: { enabled: false },
  },
  analytics: [vercel()],
  agents: {
    llmsTxt: true,
  },
});
