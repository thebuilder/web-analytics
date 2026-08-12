import { defineConfig } from "blume";

import { githubReleaseChangelogSource } from "./sources/github-releases";
import { webAnalyticsPackage } from "./umbraco-package";

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
      { type: "filesystem", root: "docs" },
      {
        type: "custom",
        source: githubReleaseChangelogSource({
          owner: "thebuilder",
          repo: "web-analytics",
        }),
      },
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
  deployment: {
    output: "static",
    site: "https://web-analytics.thebuilder.dk",
  },
  seo: {
    // Package-owned cards are generated into public/og before Blume builds.
    // Disable Blume's generated /og routes so it cannot overwrite them.
    og: { enabled: false },
  },
  analytics: {
    vercel: true,
  },
  ai: {
    llmsTxt: true,
  },
});
