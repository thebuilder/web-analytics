# Web Analytics for Umbraco

[![NuGet version](https://img.shields.io/nuget/v/TheBuilder.WebAnalytics)](https://www.nuget.org/packages/TheBuilder.WebAnalytics)
[![NuGet downloads](https://img.shields.io/nuget/dt/TheBuilder.WebAnalytics)](https://www.nuget.org/packages/TheBuilder.WebAnalytics)
[![License](https://img.shields.io/github/license/thebuilder/web-analytics)](https://github.com/thebuilder/web-analytics/blob/main/LICENSE)

Bring Vercel Web Analytics and Plausible reports into the Umbraco backoffice. Editors can understand site-wide traffic and the performance of the page they are working on without leaving Umbraco.

![Web Analytics overview in the Umbraco backoffice](https://raw.githubusercontent.com/thebuilder/web-analytics/refs/heads/main/apps/docs/docs/screenshots/analytics-overview.png)

Web Analytics reads analytics already collected by the configured provider. It does **not** install, replace, or configure tracking on your public website.

## Documentation

Read the [Web Analytics documentation](https://umbraco-web-analytics.vercel.app/) for installation, provider setup, document analytics, configuration reference, troubleshooting, and the release changelog.

- [Quickstart](https://umbraco-web-analytics.vercel.app/quickstart) — install, connect a provider, and verify the dashboard.
- [Understanding your reports](https://umbraco-web-analytics.vercel.app/guides/reports) — what each metric, breakdown, and control means.
- [Document analytics](https://umbraco-web-analytics.vercel.app/guides/document-analytics) — show page-level reports on mapped documents.
- [Configuration reference](https://umbraco-web-analytics.vercel.app/reference/configuration) — every setting, credential, and precedence rule.
- [Troubleshooting](https://umbraco-web-analytics.vercel.app/reference/troubleshooting) — missing access, connection errors, and empty reports.

## Install

Web Analytics supports Umbraco CMS 17.1 through 18.x. Add it to the Umbraco web project:

```sh
dotnet add package TheBuilder.WebAnalytics
```

The package registers its services and backoffice extensions automatically. Then:

1. Configure a Vercel or Plausible credential in server-side secret configuration (environment variable, user secrets, or your host's secret store — never `appsettings.json` or source control).
2. Restart the Umbraco application so it reads the credential.
3. As an administrator, open **Settings → Web Analytics**, add a connection, and select **Test connection**.
4. Open the **Analytics** section to verify that reports load.

The [Quickstart](https://umbraco-web-analytics.vercel.app/quickstart) walks through each step with the exact secret keys.

## Providers

| Provider | Identifier | Credential |
| --- | --- | --- |
| [Vercel Web Analytics](https://vercel.com/docs/analytics) | Project ID (`prj_...`) and optional team | Scoped access token |
| [Plausible](https://plausible.io/docs/stats-api) | Site ID, normally the registered domain | Stats API key |

Plausible Cloud's Stats API requires a Business plan. Self-hosted Plausible is supported when its instance exposes the v2 Stats API query endpoint.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository layout, local development setup (building the backoffice client, running the sample site, and running the tests), and how to submit a pull request. NuGet publishing guidance is in [docs/releasing.md](docs/releasing.md), and published release notes are in the [documentation changelog](https://umbraco-web-analytics.vercel.app/changelog/).
