# Implementation Plan: Web Analytics Marketplace readiness

## Overview

Prepare the installable NuGet package and repository metadata for Umbraco Marketplace discovery, add focused listing copy and a package icon, document a privacy-safe screenshot workflow, and verify the packed artifact before publication.

## Architecture decisions

- Keep the GitHub repository as the NuGet project URL so the Marketplace can discover root-level metadata files from the default branch.
- Treat this as an Integration because it connects Umbraco to a third-party Vercel account and service.
- Do not add screenshot URLs until approved files exist on the default branch; broken image URLs are worse than an initially text-only listing.
- Use a disposable browser state or DOM-only label replacement for captures so the package does not gain a production-facing screenshot/demo mode.

## Task list

### Phase 1: Discovery metadata

- [x] Add the `umbraco-marketplace` tag to the installable NuGet project.
- [x] Add NuGet author, project, repository, description, title, and icon metadata.
- [x] Add root-level Marketplace JSON and tailored Marketplace README content.

### Checkpoint: Metadata

- [x] The packed nuspec contains the expected Marketplace and NuGet metadata.
- [x] The Marketplace JSON conforms to the published schema.

### Phase 2: Screenshot preparation

- [x] Define a five-shot Marketplace story with exact captions and framing.
- [x] Define fictional paths, names, campaigns, and identifiers for anonymization.
- [x] Define capture, review, naming, and Marketplace JSON update steps.

### Checkpoint: Complete

- [x] Client tests and build pass.
- [x] .NET tests and NuGet pack pass.
- [x] The final package contains the README, icon, manifest, and backoffice assets.
- [ ] Approved screenshots are captured and added in a follow-up change.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A screenshot exposes a real route or identifier | High | Use the fixed fictional vocabulary and require a 200% visual review by a second person. |
| Marketplace imports incomplete metadata | Medium | Keep the project URL at the repository root and validate both JSON and the packed nuspec. |
| Screenshot URLs are broken before merge | Medium | Omit `Screenshots` until approved files are committed to the default branch. |
| NuGet package omits its icon or client assets | Medium | Inspect the generated `.nupkg` as part of verification. |

## Open questions

- Whether the first public release should remain `0.1.0` or be published as a prerelease version.
- Whether to capture optional event and UTM panels when the connected project's Vercel plan does not provide useful populated examples.
