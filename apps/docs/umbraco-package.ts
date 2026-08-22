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
  logo: "/logo.png",
  compatibility: { umbraco: ">=17.1 <19", dotnet: ">=10" },
  status: "stable",
  categories: ["Analytics", "Editor Tools"],
});

export const blurPlaceholderPackage = defineUmbracoPackage({
  id: "thebuilder.blurplaceholder",
  name: "Blur Placeholder",
  summary: "Generate WebP, BlurHash, or ThumbHash placeholders for Umbraco Image media and deliver one frontend-ready string.",
  links: {
    docs: "https://blur.thebuilder.dk/",
    nuget: "https://www.nuget.org/packages/TheBuilder.BlurPlaceholder",
    marketplace: "https://marketplace.umbraco.com/package/thebuilder.blurplaceholder",
    github: "https://github.com/thebuilder/blur-placeholder",
  },
  logo: "/ecosystem/blur-placeholder.svg",
  compatibility: { umbraco: ">=17.1 <19", dotnet: ">=10" },
  status: "stable",
  categories: ["Developer Tools", "Media"],
});

export const ecosystemPackages = [webAnalyticsPackage, blurPlaceholderPackage];
