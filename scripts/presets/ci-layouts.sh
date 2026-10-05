#!/usr/bin/env bash
# Lay out every edition of the public showcase bundles again and write their
# pagination (`layouts.<locale>.json`, see layouts.mjs), on a CI runner:
# the Release workflow runs it once the version is bumped, so the files it
# commits are stamped with the engine it publishes.
#
#   scripts/presets/ci-layouts.sh
#
# Builds the web app's workspace dependencies, serves the app with
# `next dev`, writes the files, then checks a fresh browser takes them.
set -euo pipefail

PORT="${PORT:-3107}"
BASE="http://localhost:$PORT"
LOG="${RUNNER_TEMP:-/tmp}/presets-layouts-next.log"

pnpm turbo run build --filter='web^...'

pnpm --filter web exec next dev -p "$PORT" >"$LOG" 2>&1 &
trap 'pkill -f "next dev -p $PORT" || true' EXIT

# The first request compiles the Sandbox route.
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 300 "$BASE/en/sandbox"; then break; fi
  sleep 5
done
curl -sf -o /dev/null "$BASE/en/sandbox" || { tail -50 "$LOG"; exit 1; }

node scripts/presets/layouts.mjs --base "$BASE"
node scripts/presets/layouts.mjs --base "$BASE" --verify
