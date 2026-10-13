import { resolve } from "node:path";

import type {
  ContentSource,
  SourceContext,
  SourceEntry,
} from "blume/core/sources/types.ts";
import { githubReleasesSource } from "blume/sources/github-releases.ts";

type ReleaseSourceOptions = {
  owner: string;
  repo: string;
  /** The site's own URL, so links back to it become root-relative. */
  site?: string;
};

const excludeSearchFromRaw = (raw: string): string =>
  raw.replace(/^---\n/u, "---\nsearch:\n  exclude: true\n");

const excludeFromSearch = (entry: SourceEntry): SourceEntry => ({
  ...entry,
  data: {
    ...entry.data,
    search: { exclude: true },
  },
  raw: entry.raw ? excludeSearchFromRaw(entry.raw) : undefined,
});

// Wraps Blume's GitHub Releases engine so every release page stays out of
// search. Blume rebuilds a custom() source on each scan's context through
// withContext, so the wrapper re-applies itself there, otherwise the rebuilt
// engine would drop the search exclusion.
const withSearchExcluded = (source: ContentSource): ContentSource => {
  const { read, withContext } = source;

  return {
    ...source,
    load: async () => {
      const result = await source.load();

      return {
        ...result,
        entries: result.entries.map(excludeFromSearch),
      };
    },
    read: read
      ? async (ref: string) => excludeSearchFromRaw(await read(ref))
      : undefined,
    withContext: withContext
      ? (ctx: SourceContext) => withSearchExcluded(withContext(ctx))
      : undefined,
  };
};

export const githubReleaseChangelogSource = ({
  owner,
  repo,
  site,
}: ReleaseSourceOptions): ContentSource =>
  withSearchExcluded(
    githubReleasesSource(
      {
        name: "changelog",
        owner,
        prefix: "changelog",
        repo,
        site,
      },
      // Placeholder until Blume calls withContext with the scan's context.
      {
        cacheDir: resolve(".blume/cache/changelog"),
        mode: "build",
        projectRoot: process.cwd(),
      },
    ),
  );
