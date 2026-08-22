# Contributing to Web Analytics

Thanks for helping improve Web Analytics for Umbraco. This guide covers the repository layout, how to set up a local development environment, and how to get a change merged. [docs/releasing.md](docs/releasing.md) covers how a released version reaches NuGet.

## Repository layout

The repository is a pnpm and .NET workspace. The folders you are most likely to touch:

| Path | What it is |
| --- | --- |
| `src/TheBuilder.WebAnalytics/` | The NuGet package: Umbraco API controllers, provider clients, services, and the packaging targets. |
| `src/TheBuilder.WebAnalytics/Client/` | The backoffice frontend (TypeScript, Lit, Vite). Built assets are emitted to `wwwroot/App_Plugins/`. |
| `samples/TheBuilder.WebAnalytics.Example/` | A runnable Umbraco site that references the package for local development. |
| `tests/TheBuilder.WebAnalytics.Tests/` | The .NET (xUnit) test project. Frontend tests (Vitest) live beside the client source. |
| `apps/docs/` | The documentation site (Blume) published to <https://web-analytics.thebuilder.dk/>. |
| `docs/releasing.md` | How package versions are published to NuGet. |

## Prerequisites

- [.NET SDK 10.0](https://dotnet.microsoft.com/download) builds the package, sample, and tests.
- [Node.js 24](https://nodejs.org/) builds the backoffice client and the docs site.
- [pnpm](https://pnpm.io/) via [Corepack](https://nodejs.org/api/corepack.html). Run `corepack enable` once. The pinned pnpm version comes from `package.json`.

Install the JavaScript dependencies from the repository root:

```sh
pnpm install
```

## Build the backoffice client

The backoffice UI is a separate frontend build. A plain `dotnet build` of the sample does **not** rebuild it. Only packing the NuGet package triggers the client build, so during development you run it yourself. The assets land in `wwwroot/App_Plugins/`:

```sh
pnpm client:build   # one-off build
pnpm client:watch   # rebuild on change and refresh the running backoffice
```

## Run the sample site

The example project references the package directly, so it always uses your local source. With the client already built, run it from the repository root:

```sh
dotnet run --project samples/TheBuilder.WebAnalytics.Example
```

On first launch Umbraco installs unattended and creates a local SQLite database. In `Development` the sample turns on mock connections (`WebAnalytics:EnableMockConnections`), so the Analytics section shows deterministic sample data without any Vercel or Plausible credential. For live data, set up a real provider credential and connection the way a consumer would. See the [Quickstart](https://web-analytics.thebuilder.dk/quickstart).

Run `pnpm client:watch` in one terminal and `dotnet run` in another for the fastest loop.

## Run the tests and checks

```sh
pnpm test                                                   # frontend unit tests (Vitest)
pnpm client:check                                           # frontend type-check
dotnet test tests/TheBuilder.WebAnalytics.Tests/TheBuilder.WebAnalytics.Tests.csproj   # .NET tests
```

CI runs the .NET suite against Umbraco 17.1, the latest 17.x, and the latest 18.x. Target one line locally by passing the version, for example `-p:UmbracoVersion=18.*`.

## Work on the documentation site

```sh
pnpm docs:dev        # local preview with hot reload
pnpm docs:build      # production build
pnpm docs:check      # validate content and links
```

The content in `apps/docs/` is Markdown and MDX. The files under `apps/docs/docs/` show the structure.

## Submitting a change

1. Create a branch for your change.
2. Keep pull requests focused, and update the docs under `apps/docs/` when behaviour changes.
3. Run the frontend and .NET tests above so CI passes first time. The `Validate` workflow builds the client, runs both test suites across the supported Umbraco versions, and validates the NuGet package.
4. Open a pull request against `main` explaining what changed and why.

## Releasing

Publishing to NuGet is release-driven and documented separately in [docs/releasing.md](docs/releasing.md). GitHub Releases are the authoritative changelog and are mirrored in the [documentation changelog](https://web-analytics.thebuilder.dk/changelog/).
