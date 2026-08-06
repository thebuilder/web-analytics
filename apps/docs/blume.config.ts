import { defineConfig } from "blume";

import { githubReleaseChangelogSource } from "./sources/github-releases";

export default defineConfig({
  title: "Web Analytics",
  description:
    "Bring Vercel Web Analytics and Plausible reports into the Umbraco backoffice.",
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
    site: "https://umbraco-web-analytics.vercel.app",
  },
  analytics: {
    vercel: true,
  },
  ai: {
    llmsTxt: true,
  },
});
