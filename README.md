# Web Analytics for Umbraco

[![NuGet version](https://img.shields.io/nuget/v/TheBuilder.WebAnalytics)](https://www.nuget.org/packages/TheBuilder.WebAnalytics)
[![NuGet downloads](https://img.shields.io/nuget/dt/TheBuilder.WebAnalytics)](https://www.nuget.org/packages/TheBuilder.WebAnalytics)
[![License](https://img.shields.io/github/license/thebuilder/web-analytics)](https://github.com/thebuilder/web-analytics/blob/main/LICENSE)

Bring Vercel Web Analytics and Plausible reports into the Umbraco backoffice. Editors can understand site-wide traffic and the performance of the page they are working on without leaving Umbraco.

![Web Analytics overview in the Umbraco backoffice](https://raw.githubusercontent.com/thebuilder/web-analytics/refs/heads/main/apps/docs/docs/screenshots/analytics-overview.png)

Web Analytics reads analytics already collected by the configured provider. It does **not** install, replace, or configure tracking on your public website.

## Documentation

Read the [Web Analytics documentation](https://umbraco-web-analytics.vercel.app/) for installation, provider setup, document analytics, configuration reference, troubleshooting, and the release changelog.

## Install

Web Analytics supports Umbraco CMS 17.1 through 18.x. Add it to the Umbraco web project:

```sh
dotnet add package TheBuilder.WebAnalytics
```

The package registers its services and backoffice extensions automatically. Configure a Vercel or Plausible credential in server-side secret configuration, then add and test a connection at **Settings → Web Analytics**.

## Providers

| Provider | Identifier | Credential |
| --- | --- | --- |
| [Vercel Web Analytics](https://vercel.com/docs/analytics) | Project ID (`prj_...`) and optional team | Scoped access token |
| [Plausible](https://plausible.io/docs/stats-api) | Site ID, normally the registered domain | Stats API key |

Plausible Cloud's Stats API requires a Business plan. Self-hosted Plausible is supported when its instance exposes the v2 Stats API query endpoint.

## Contributing and releases

Development and NuGet publishing guidance is kept in [docs/releasing.md](docs/releasing.md). Published release notes are available in the [documentation changelog](https://umbraco-web-analytics.vercel.app/changelog/).
