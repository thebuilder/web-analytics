import { defineUmbracoPackage } from "@thebuilder/umbraco-docs";

export const webAnalyticsPackage = defineUmbracoPackage({
  id: "thebuilder.webanalytics",
  name: "Web Analytics",
  summary: "Report the traffic your site already sends to Vercel Web Analytics or Plausible inside the Umbraco backoffice, site-wide and per page.",
  links: {
    docs: "https://web-analytics.thebuilder.dk/",
    nuget: "https://www.nuget.org/packages/TheBuilder.WebAnalytics",
    marketplace: "https://marketplace.umbraco.com/package/thebuilder.webanalytics",
    github: "https://github.com/thebuilder/web-analytics",
  },
  logo: "/logo-mark.svg",
  compatibility: { umbraco: ">=17.1 <19", dotnet: ">=10" },
  status: "stable",
  categories: ["Analytics", "Editor Tools"],
});
