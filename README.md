# Umbraco Vercel Analytics

`Umbraco.VercelAnalytics` displays Vercel Web Analytics in the Umbraco 17 and 18 backoffice.

It provides:

- A global **Analytics** section for traffic, audience, referrers, pages, routes, UTM data, and custom events.
- An **Analytics** workspace view on configured, published documents, filtered to the document's route.
- Multiple Vercel project connections for multi-site Umbraco installations.
- Server-side Vercel API access so the access token is never sent to the browser.

The package reads analytics already collected by Vercel. It does not add Vercel tracking to the public website.

## Requirements

- Umbraco CMS 17.1 or later, up to (but not including) Umbraco 19.
- A Vercel project with [Web Analytics enabled and installed](https://vercel.com/docs/analytics/quickstart).
- A [Vercel access token](https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token) scoped to the personal account or team that owns the project.
- The Vercel project ID (`prj_...`).

## Install

Add the package to the Umbraco web project:

```sh
dotnet add path/to/Your.Umbraco.Web.csproj package Umbraco.VercelAnalytics
```

The package registers its services and backoffice extensions automatically. No changes to `Program.cs` are required.

Build and deploy the Umbraco application as usual. The package's `App_Plugins` assets are included in the publish output through NuGet static web assets.

## Configure a production connection

Configuration uses two sources:

- Project details, mappings, and display settings are stored in Umbraco.
- The Vercel access token stays in the application's secret configuration.

### 1. Create a Vercel access token

Create a token in the Vercel account settings and scope it to the account or team that owns the project. Copy it when it is created; Vercel does not show it again.

For a team-owned project, also copy either the team ID (`team_...`) or team slug. Personal projects do not need either value. The backoffice presents these as one **Team ID or slug** field. See the [Vercel REST API authentication documentation](https://vercel.com/docs/rest-api).

### 2. Add the token to the Umbraco deployment

Configure one shared token for the package:

```text
VercelAnalytics__AccessToken
```

Examples:

```sh
# Local shell or container environment
export VercelAnalytics__AccessToken="your_token"

# .NET user-secrets
dotnet user-secrets init \
  --project path/to/Your.Umbraco.Web.csproj

dotnet user-secrets set \
  "VercelAnalytics:AccessToken" \
  "your_token" \
  --project path/to/Your.Umbraco.Web.csproj
```

Use the equivalent secret/app-setting facility in Azure App Service, Kubernetes, Docker, or the hosting platform. Do not commit the token to `appsettings.json` or source control.

Restart every Umbraco application instance after adding or rotating a token. Tokens are loaded from server configuration at application startup.

The shared token is used by every connection. If a project must use a different token, expand **Token override** for that connection and copy the generated environment-variable name. Overrides use `VercelAnalytics__ConnectionAccessTokens__{connection-guid}`.

### 3. Configure the connection in Umbraco

Sign in as an administrator and open **Settings → Vercel Analytics**.

1. Select **Add connection**.
2. Enter the Vercel project ID. The project name is loaded from Vercel.
3. For a team project, enter its team ID or slug in the combined **Team ID or slug** field.
4. Configure page analytics mappings if document-level reports are required.
5. Select the document types that should display the Analytics workspace view, or enable all document types.
6. Enable the package. The first connection is used as the initial default.
7. Select **Save settings**, then **Test connection**.

The test confirms that Vercel accepts the token, project, and team configuration. The settings screen reports whether the shared token or a connection override was found; it never displays or stores the token itself.

## Document analytics mappings

Mappings are optional. A connection without mappings is available in the global Analytics section but does not add reports to document workspaces.

For document analytics, select each Umbraco site's root document. The nearest mapped ancestor determines which Vercel connection a document uses.

The document Analytics view is shown only when all of these conditions are met:

- The document is published and has a published route.
- Its nearest configured document root resolves to a connection.
- Its document type is enabled for that connection.
- The current user has Content-section access and read permission for the document.

## Backoffice permissions

On the first successful package startup, the Analytics section is added to the built-in **Administrators** user group. This initialization runs once and does not re-add the section if it is removed later.

To give other users access, add the **Analytics** section to their Umbraco user group. Global reports require Analytics-section access. Document reports additionally require Content-section access and document read permission.

Only administrators can open or update **Settings → Vercel Analytics**.

## Configuration-only setup

The backoffice settings screen is the normal configuration path. A deployment can instead bootstrap all non-secret settings from `appsettings.json`:

```json
{
  "VercelAnalytics": {
    "Enabled": true,
    "DefaultRangeDays": 30,
    "CacheDuration": "00:05:00",
    "Connections": [
      {
        "Key": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "ProjectId": "prj_...",
        "Team": "team_...",
        "DocumentRootKeys": [
          "11111111-1111-1111-1111-111111111111"
        ],
        "EnableAllDocumentTypes": false,
        "EnabledDocumentTypeKeys": [
          "22222222-2222-2222-2222-222222222222"
        ]
      }
    ]
  }
}
```

`Team` accepts either a Vercel team ID beginning with `team_` or a team slug. Leave it empty for a personal project.

### Configuration reference

Package settings use the `VercelAnalytics` section.

| Key | Default | Description |
| --- | --- | --- |
| `Enabled` | `false` | Enables the Analytics section and configured document workspace views. |
| `AccessToken` | Empty | Shared Vercel access token used by every connection. Supply through secret configuration. |
| `DefaultRangeDays` | `30` | Initial report range in days. Valid values are 1–730. |
| `CacheDuration` | `00:05:00` | Per-instance in-memory cache duration. Valid values are zero to one hour. |
| `Connections` | `[]` | Vercel project connection definitions. The first connection becomes the initial default. |
| `ConnectionAccessTokens` | Empty | Optional secret dictionary keyed by a connection GUID. Prefer the copyable environment-variable name shown in the settings UI. |

Each entry under `Connections` supports:

| Key | Default | Description |
| --- | --- | --- |
| `Key` | Generated GUID | Stable internal identity. The settings UI creates this automatically; provide a fixed GUID for deterministic configuration-only setup. |
| `DisplayName` | Empty | Cached project name used until the name can be loaded from Vercel. |
| `ProjectId` | Required | Vercel project ID beginning with `prj_`. |
| `Team` | Empty | Optional team ID (`team_...`) or team slug. Leave empty for a personal project. |
| `DocumentRootKeys` | `[]` | Umbraco document-root GUIDs that map document analytics to this connection. |
| `EnableAllDocumentTypes` | `false` | Shows document analytics for every document type beneath a mapped root. |
| `EnabledDocumentTypeKeys` | `[]` | Document-type GUIDs that show document analytics when all types are not enabled. |
| `EnabledDocumentTypes` | `[]` | Document-type aliases used by configuration-only bootstrapping. Prefer stable document-type keys for settings managed in Umbraco. |

Keep tokens out of the JSON file. Supply the shared token through `VercelAnalytics__AccessToken`; only use `VercelAnalytics__ConnectionAccessTokens__{connection-guid}` when one connection requires an override.

Before the settings screen has saved anything, Umbraco uses these server options as the initial configuration. After an administrator saves the settings screen, the non-secret settings are stored in Umbraco's database and become the source of truth. Access tokens continue to come from server configuration, with a connection-specific token taking precedence over the shared token.

In a load-balanced deployment, restart all Umbraco instances after changing saved connection settings or server-side tokens so every process uses the same configuration.

The default cache duration is five minutes. Each Umbraco instance maintains its own in-memory report cache.

## Verify the deployment

After deployment:

1. Open **Settings → Vercel Analytics** and confirm the shared access token says **Configured on the server**.
2. Select **Save settings**, then **Test connection**.
3. Open the global **Analytics** section and confirm totals and history load.
4. If document analytics is enabled, open a mapped published document and select its **Analytics** workspace view.
5. Grant the Analytics section to any non-administrator user groups that need global reports.

The available reporting window and some dimensions depend on the Vercel plan and the data recorded by the project. Unsupported optional panels are hidden rather than treated as connection failures.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| **Token missing** | Configure `VercelAnalytics__AccessToken`, or a connection-specific override, and restart the application. |
| Vercel returns `401` or `403` | Confirm the token is valid, scoped to the owning account/team, and has access to the configured project. |
| Vercel returns `400` | Verify the project ID and the optional `Team` value. |
| Analytics section is not visible | Add the Analytics section to the user's Umbraco user group. The automatic administrator grant runs only once. |
| Document Analytics view is not visible | Confirm the document is published, beneath a configured document root, uses an enabled document type, and the user can read it. |
| No data appears | Confirm Web Analytics is enabled and installed on the public site, production traffic has been recorded, and the selected date is inside Vercel's reporting window. |
| Settings differ between application instances | Restart every instance after changing settings or tokens. |

## Development

When the example host runs with `ASPNETCORE_ENVIRONMENT=Development`, **Settings → Vercel Analytics** includes development data presets for a full demo, UTM campaigns, feature flags, and custom events. Add and save a mock connection like any other connection, then select it in the Analytics dashboard. Mock reports are deterministic, require no access token, and never call Vercel. Persisted mock connections become inactive when the host is not running in Development.

The client uses pnpm 11. From `src/Umbraco.VercelAnalytics/Client`:

```sh
pnpm install
pnpm check
pnpm test
pnpm build
```

The generated API client is checked in with the package source. The example host registers the package's OpenAPI document for development without adding version-specific OpenAPI dependencies to the distributed package.

Run the example host against the Umbraco version whose document you want to use:

```sh
# Umbraco 17
dotnet run \
  --project samples/Umbraco.VercelAnalytics.Example \
  -p:UmbracoVersion=17.1.0

# Umbraco 18
dotnet run \
  --project samples/Umbraco.VercelAnalytics.Example \
  -p:UmbracoVersion=18.0.0
```

Use a separate database for each major when switching the example host between versions. Umbraco upgrades its database schema and does not support downgrading that database to an earlier major.

Then regenerate the client from the matching development endpoint:

```sh
cd src/Umbraco.VercelAnalytics/Client

# Umbraco 17
corepack pnpm generate-client -- \
  https://localhost:44389/umbraco/swagger/umbracovercelanalytics/swagger.json

# Umbraco 18
corepack pnpm generate-client -- \
  https://localhost:44389/umbraco/openapi/umbracovercelanalytics.json
```
