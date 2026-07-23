#!/usr/bin/env bash

set -euo pipefail

worktree_root="$(git rev-parse --show-toplevel)"
source_worktree="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
database_relative_path="samples/TheBuilder.WebAnalytics.Example/umbraco/Data/Umbraco.sqlite.db"
source_database="$source_worktree/$database_relative_path"
worktree_database="$worktree_root/$database_relative_path"

if [[ "$source_database" != "$worktree_database" ]]; then
  if [[ ! -f "$source_database" ]]; then
    echo "Source SQLite database not found: $source_database" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$worktree_database")"
  sqlite3 "$source_database" ".backup '$worktree_database'"
  [[ "$(sqlite3 "$worktree_database" 'PRAGMA integrity_check;')" == "ok" ]]
fi

pushd "$worktree_root/src/TheBuilder.WebAnalytics/Client" >/dev/null
corepack pnpm install --frozen-lockfile
corepack pnpm build
popd >/dev/null
