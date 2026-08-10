# Releasing the NuGet package

GitHub Releases are the authoritative changelog and the release tag is the single source of package versions. The `0.1.0` versions in the project and client package files are local-build fallbacks only.

## One-time setup

1. Create the `nuget` GitHub environment.
2. Add a `NUGET_USER` environment secret containing the nuget.org username.
3. Add required reviewers to the environment if publishing should require explicit approval.
4. Configure a trusted publishing policy on nuget.org with:
   - Repository owner: `thebuilder`
   - Repository: `web-analytics`
   - Workflow: `publish-nuget.yml`
   - Environment: `nuget`

## Publish a prerelease

1. Create a GitHub Release from the commit to publish.
2. Give it a unique prerelease tag such as `v0.2.0-preview.1`.
3. Select **Set as a pre-release**.
4. Publish the release.

The workflow publishes the prerelease package to nuget.org. NuGet package versions are immutable, so increment the prerelease number for every publish.

## Publish a stable release

1. Create a GitHub Release from the commit to publish.
2. Give it a new SemVer tag such as `v0.2.0`.
3. Ensure **Set as a pre-release** is not selected.
4. Publish the release.

Publishing the release triggers the workflow. It removes the optional leading `v`, verifies the client, .NET projects, sample, docs, generated Umbraco manifest, NuGet metadata, and release-notes URL, then publishes that exact verified artifact to nuget.org with a short-lived OIDC credential. For example, `v0.1.0-preview.1` produces version `0.1.0-preview.1` everywhere and links its NuGet release notes to that GitHub Release.

The GitHub Release type and version must agree: prereleases require a prerelease version, and stable releases require a stable version.
