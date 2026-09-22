#!/usr/bin/env bash
# Decide the version a package releases at, and write it to its package.json.
#
#   release-version.sh <package-dir> <npm-name> <bump-type>
#
# - repo == npm  → bump (the normal release: patch/minor/major from PR labels)
# - repo >  npm  → release the repo version as-is (a version raised by hand,
#                  e.g. 0.3.x → 1.1.0, or a package's first release)
# - repo <  npm  → a previous run published but failed to push the bump
#                  commit; sync to npm, then bump
#
# Prints the resulting version on the last line of stdout.
set -euo pipefail

dir="$1"; name="$2"; bump="$3"
cd "$dir"

local_version=$(node -p "require('./package.json').version")
if npm_version=$(npm view "$name" version 2>/dev/null) && [ -n "$npm_version" ]; then
  :
else
  npm_version="0.0.0"
  echo "$name is not on npm yet"
fi
highest=$(printf '%s\n%s\n' "$npm_version" "$local_version" | sort -V | tail -1)

if [ "$npm_version" = "$local_version" ]; then
  npm version "$bump" --no-git-tag-version >/dev/null
  echo "$name: $local_version on npm and in the repo — $bump bump"
elif [ "$highest" = "$local_version" ]; then
  echo "$name: repo at $local_version is ahead of npm ($npm_version) — releasing it as-is"
else
  echo "$name: repo at $local_version lags npm ($npm_version) — syncing, then $bump bump"
  npm version "$npm_version" --no-git-tag-version --allow-same-version >/dev/null
  npm version "$bump" --no-git-tag-version >/dev/null
fi

node -p "require('./package.json').version"
