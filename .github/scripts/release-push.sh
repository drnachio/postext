#!/usr/bin/env bash
# Push the release commit and its tags to main, all or nothing.
#
#   release-push.sh <tag>...
#
# Run on main, with the annotated tags on HEAD. The packages are already on
# npm: a push lost now costs a version (release-version.sh syncs to npm, then
# bumps). So a refused push is not the end of it:
#
# - main moved → rebase the release commit onto it, move the tags to the
#                rebased commit and push again at once. The commit records
#                `Rebased-onto: <sha>`: that commit is not released yet, and
#                the `gate` job lets its run through on this line.
# - main moved, no release commit (versions raised by hand) → the tags stay on
#                the commit that was published; main needs no push.
# - main did not move → GitHub is down: wait and try again (`fatal error in
#                commit_refs`, 1.68.0, 2026-11-04).
#
# A rebase that conflicts fails at once: waiting does not change it.
set -euo pipefail

upstream=refs/remotes/origin/main
moves_left=10
message=$(git log -1 --format=%B)

tags=("$@")
tag_refs=()
for tag in "${tags[@]}"; do tag_refs+=("refs/tags/$tag"); done
refs=(HEAD:refs/heads/main "${tag_refs[@]}")

# Seconds between tries when main did not move
# shellcheck disable=SC2086
set -- ${RELEASE_PUSH_WAITS-60 120 240 480}

move_tags() {
  local tag annotation
  for tag in "${tags[@]}"; do
    annotation=$(git for-each-ref --format='%(contents)' "refs/tags/$tag")
    git tag -f -a "$tag" -m "$annotation" HEAD >/dev/null
  done
}

while ! git push --atomic origin "${refs[@]}"; do
  if [ "${#refs[@]}" -gt "${#tag_refs[@]}" ] &&
    git fetch --no-tags origin "+refs/heads/main:$upstream" &&
    ! git merge-base --is-ancestor "$upstream" HEAD; then
    if [ "$moves_left" = 0 ]; then
      echo "::error::main keeps moving; giving up. The packages are on npm: the next run syncs and bumps."
      exit 1
    fi
    moves_left=$((moves_left - 1))

    if git merge-base --is-ancestor HEAD "$upstream"; then
      echo "::warning::main moved and there is no release commit to rebase: pushing the tags alone"
      refs=("${tag_refs[@]}")
      continue
    fi

    base=$(git rev-parse "$upstream")
    echo "::warning::main moved to $base: rebasing the release commit onto it"
    # --autostash: the run may leave changes it did not commit (a pagination
    # step that failed half-way), which the rebase would refuse.
    if ! git rebase --autostash "$upstream"; then
      git rebase --abort
      echo "::error::The release commit conflicts with main at $base. The packages are on npm: the next run syncs and bumps."
      exit 1
    fi
    # Nothing left when main already carries the same change
    if [ "$(git rev-parse HEAD)" != "$base" ]; then
      git commit --amend -m "$message" -m "Rebased-onto: $base"
    fi
    move_tags
    continue
  fi

  if [ "$#" = 0 ]; then
    echo "::error::Push refused and main did not move. The packages are on npm: the next run syncs and bumps."
    exit 1
  fi
  echo "::warning::Push refused; trying again in $1 s"
  sleep "$1"
  shift
done
