#!/usr/bin/env bash
# Should this run still publish? The build and the tests take minutes, and
# `gate` only looked at main before them. Prints true or false on the last line.
#
# false: main moved to a commit with a Release run of its own, which releases
# everything up to it. Publishing here would only spend a version.
#
# true: main did not move, or moved only by files that start no run (the
# workflow's paths-ignore, repeated below): nobody else would release this
# commit, and release-push.sh rebases over the move. Also true when main cannot
# be read: release-push.sh waits out an outage, and a release lost now has no
# run to replace it.
set -euo pipefail

if ! git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main >&2; then
  echo "::warning::Cannot read main: publishing anyway" >&2
  echo true
  exit 0
fi

if git diff --quiet HEAD refs/remotes/origin/main -- . ':(exclude).github/**' ':(exclude)README.md'; then
  echo true
else
  echo "::notice::main moved to $(git rev-parse refs/remotes/origin/main): the newer run releases it; this one publishes nothing." >&2
  echo false
fi
