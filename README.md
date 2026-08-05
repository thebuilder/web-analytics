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

## Repository layout

This repository is a pnpm and .NET workspace. The most relevant folders for a contributor:

| Path | What it is |
| --- | --- |
| `src/TheBuilder.WebAnalytics/` | The NuGet package: Umbraco API controllers, provider clients, services, and the packaging targets. |
| `src/TheBuilder.WebAnalytics/Client/` | The backoffice frontend (TypeScript, Lit, Vite). Built assets are emitted to `wwwroot/App_Plugins/`. |
| `samples/TheBuilder.WebAnalytics.Example/` | A runnable Umbraco site that references the package for local development. |
| `tests/TheBuilder.WebAnalytics.Tests/` | The .NET (xUnit) test project. Frontend tests (Vitest) live beside the client source. |
| `apps/docs/` | The documentation site (Blume) published to <https://umbraco-web-analytics.vercel.app/>. |
| `docs/releasing.md` | How package versions are published to NuGet. |

## Local development

### Prerequisites

- [.NET SDK 10.0](https://dotnet.microsoft.com/download) — builds the package, sample, and tests.
- [Node.js 24](https://nodejs.org/) — builds the backoffice client and the docs site.
- [pnpm](https://pnpm.io/) via [Corepack](https://nodejs.org/api/corepack.html). Run `corepack enable` once; the pinned pnpm version is resolved automatically from `package.json`.

Install the JavaScript dependencies from the repository root:

```sh
pnpm install
```

### Build the backoffice client

The backoffice UI is a separate frontend build. A plain `dotnet build` of the sample does **not** rebuild it — the client is only built automatically when the NuGet package is packed. During development, build (or watch) the client yourself so its assets land in `wwwroot/App_Plugins/`:

```sh
pnpm client:build   # one-off build
pnpm client:watch   # rebuild on change and refresh the running backoffice
```

### Run the sample site

The example project references the package directly, so it always uses your local source. With the client already built, run it from the repository root:

```sh
dotnet run --project samples/TheBuilder.WebAnalytics.Example
```

On first launch Umbraco installs unattended and creates a local SQLite database. In `Development` the sample enables mock connections (`WebAnalytics:EnableMockConnections`), so the Analytics section shows deterministic sample data without any Vercel or Plausible credential. For live data, configure a real provider credential and connection exactly as a consumer would (see the [Quickstart](https://umbraco-web-analytics.vercel.app/quickstart)).

For an efficient loop, run `pnpm client:watch` in one terminal and `dotnet run` in another.

### Run the tests and checks

```sh
pnpm test                                                   # frontend unit tests (Vitest)
pnpm client:check                                           # frontend type-check
dotnet test tests/TheBuilder.WebAnalytics.Tests/TheBuilder.WebAnalytics.Tests.csproj   # .NET tests
```

The .NET suite runs against Umbraco 17.1, the latest 17.x, and the latest 18.x in CI. Target a specific line locally by passing the version, for example `-p:UmbracoVersion=18.*`.

### Work on the documentation site

```sh
pnpm docs:dev        # local preview with hot reload
pnpm docs:build      # production build
pnpm docs:check      # validate content and links
```

The `apps/docs/` content is Markdown/MDX; see the files under `apps/docs/docs/` for structure.

## Contributing and releases

Contributions are welcome via pull request. Before opening one, run the frontend and .NET tests above so CI passes on the first try. The `Validate` workflow builds the client, runs both test suites across the supported Umbraco versions, and validates the NuGet package.

NuGet publishing guidance is kept in [docs/releasing.md](docs/releasing.md). Published release notes are available in the [documentation changelog](https://umbraco-web-analytics.vercel.app/changelog/).
