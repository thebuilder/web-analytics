import { defineConfig } from "blume";

import { githubReleaseChangelogSource } from "./sources/github-releases";

export default defineConfig({
  title: "Web Analytics",
  description:
    "Bring Vercel Web Analytics and Plausible reports into the Umbraco backoffice.",
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
      { label: "Docs", path: "/" },
      { label: "Changelog", path: "/changelog", href: "/changelog" },
    ],
  },
  deployment: {
    output: "static",
    site: "https://umbraco-web-analytics.vercel.app",
  },
  analytics: {
    vercel: true,
  },
  ai: {
    llmsTxt: true,
  },
});
