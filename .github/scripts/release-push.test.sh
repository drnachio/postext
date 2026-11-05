#!/usr/bin/env bash
# release-push.sh and release-current.sh against a scratch bare repository.
# Git only, no network: `bash .github/scripts/release-push.test.sh`
set -uo pipefail

scripts=$(cd "$(dirname "$0")" && pwd)
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
export RELEASE_PUSH_WAITS="0 0 0"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
failures=0

ok() { echo "  ok: $1"; }
fail() {
  echo "  FAILED: $1"
  failures=$((failures + 1))
}
check() { # <description> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1: got '$2', expected '$3'"; fi
}

# A bare origin with main and develop, a clone `run` as actions/checkout leaves
# it, and a clone `other` for whoever merges while the release runs.
setup() {
  rm -rf "$root/case"
  mkdir -p "$root/case"
  cd "$root/case" || exit 1
  git init -q --bare -b main origin.git
  git clone -q origin.git other 2>/dev/null
  (
    cd other || exit 1
    git checkout -q -b main 2>/dev/null
    printf '{\n  "version": "1.0.0",\n  "a": 1,\n  "b": 2,\n  "c": 3,\n  "d": 4\n}\n' >package.json
    echo one >src.txt
    git add . && git commit -q -m "first"
    git push -q origin main
    git push -q origin main:develop
  )
  git clone -q origin.git run
  cd run || exit 1
}

# The release: version bump, commit, annotated tags
release_commit() {
  sed -i.bak 's/"version": "1.0.0"/"version": "1.1.0"/' package.json && rm package.json.bak
  git add package.json
  git commit -q -m "chore: release v1.1.0"
  tag_release
}
tag_release() {
  git tag -a v1.1.0 -m "v1.1.0"
  git tag -a pdf-v1.1.0 -m "pdf v1.1.0"
}

# A merge into main from elsewhere: merge_elsewhere <file> [<content>]
merge_elsewhere() {
  (
    cd ../other || exit 1
    git pull -q origin main
    mkdir -p "$(dirname "$1")"
    echo "${2:-change}" >"$1"
    git add .
    git commit -q -m "merge: $1"
    git push -q origin main
  )
}

origin() { git --git-dir="$root/case/origin.git" "$@"; }
push_release() { "$scripts/release-push.sh" v1.1.0 pdf-v1.1.0 >"$root/out" 2>&1; }
tip() { origin rev-parse main; }

echo "main did not move"
setup
release_commit
push_release
check "exit" "$?" 0
check "main is the release commit" "$(tip)" "$(git rev-parse HEAD)"
check "tag on it" "$(origin rev-parse 'v1.1.0^{commit}')" "$(git rev-parse HEAD)"
check "no trailer" "$(origin log -1 --format=%B main | grep -c Rebased-onto)" 0

echo "main moved before the push"
setup
release_commit
old=$(git rev-parse HEAD)
merge_elsewhere src.txt moved
moved=$(tip)
push_release
check "exit" "$?" 0
check "release commit sits on the moved commit" "$(origin rev-parse 'main^')" "$moved"
check "the moved commit's change is kept" "$(origin show main:src.txt)" moved
check "the version bump is kept" "$(origin show main:package.json | grep -c 1.1.0)" 1
check "subject kept" "$(origin log -1 --format=%s main)" "chore: release v1.1.0"
check "trailer names the moved commit" "$(origin log -1 --format=%B main | grep Rebased-onto)" "Rebased-onto: $moved"
check "v tag on the rebased commit" "$(origin rev-parse 'v1.1.0^{commit}')" "$(tip)"
check "pdf tag on the rebased commit" "$(origin rev-parse 'pdf-v1.1.0^{commit}')" "$(tip)"
check "tags stay annotated" "$(origin cat-file -t v1.1.0)" tag
check "annotation kept" "$(origin for-each-ref --format='%(contents:subject)' refs/tags/pdf-v1.1.0)" "pdf v1.1.0"
check "the unrebased commit never reached origin" "$(origin cat-file -e "$old" 2>/dev/null && echo yes || echo no)" no
# The workflow's next step, as it stands
git fetch -q origin develop && git checkout -q develop && git merge main --no-edit -q && git push -q origin develop
check "sync to develop" "$?" 0
check "develop has the release commit" "$(origin merge-base --is-ancestor main develop && echo yes || echo no)" yes

echo "main moved again between the rebase and the next push"
setup
release_commit
merge_elsewhere first.txt
cat >.git/hooks/pre-push <<'HOOK'
#!/bin/sh
# The first push finds main moved; another merge lands just before the second
[ -f .git/pushed-once ] || { touch .git/pushed-once; exit 0; }
rm .git/hooks/pre-push
cd ../other && git pull -q origin main && echo second >second.txt && git add . && git commit -q -m second && git push -q origin main
HOOK
chmod +x .git/hooks/pre-push
push_release
check "exit" "$?" 0
check "on the last move" "$(origin show main^:second.txt)" second
check "rebased twice" "$(grep -c 'rebasing the release commit' "$root/out")" 2
check "one trailer, the last base" "$(origin log -1 --format=%B main | grep Rebased-onto)" "Rebased-onto: $(origin rev-parse 'main^')"
check "tag on the tip" "$(origin rev-parse 'v1.1.0^{commit}')" "$(tip)"

echo "main moved, and the run left changes it did not commit"
setup
release_commit
echo half-written >src.txt
merge_elsewhere other.txt
push_release
check "exit" "$?" 0
check "the release is on main" "$(origin show main:package.json | grep -c 1.1.0)" 1
check "uncommitted change not pushed" "$(origin show main:src.txt)" one

echo "outage: refused twice, main did not move"
setup
release_commit
cat >"$root/case/origin.git/hooks/pre-receive" <<HOOK
#!/bin/sh
n=\$(cat "$root/case/count" 2>/dev/null || echo 0)
echo \$((n + 1)) >"$root/case/count"
[ "\$n" -ge 2 ]
HOOK
chmod +x "$root/case/origin.git/hooks/pre-receive"
head=$(git rev-parse HEAD)
push_release
check "exit" "$?" 0
check "commit unchanged" "$(tip)" "$head"
check "waited twice" "$(grep -c 'trying again' "$root/out")" 2

echo "branch refused for good: no tag reaches origin"
setup
release_commit
cat >"$root/case/origin.git/hooks/update" <<'HOOK'
#!/bin/sh
[ "$1" != refs/heads/main ]
HOOK
chmod +x "$root/case/origin.git/hooks/update"
before=$(tip)
push_release
check "exit" "$?" 1
check "main unchanged" "$(tip)" "$before"
check "no tags on origin" "$(origin tag | wc -l | tr -d ' ')" 0
check "gave up after the waits" "$(grep -c 'trying again' "$root/out")" 3

echo "conflict with the moved commit"
setup
release_commit
merge_elsewhere package.json '{ "version": "9.9.9" }'
moved=$(tip)
push_release
check "exit" "$?" 1
check "main unchanged" "$(tip)" "$moved"
check "no tags on origin" "$(origin tag | wc -l | tr -d ' ')" 0
check "no rebase left behind" "$(test -d .git/rebase-merge && echo yes || echo no)" no
check "says so" "$(grep -c 'conflicts with main' "$root/out")" 1
check "failed at once" "$(grep -c 'trying again' "$root/out")" 0

echo "versions raised by hand (no release commit), main moved"
setup
tag_release
published=$(git rev-parse HEAD)
merge_elsewhere src.txt moved
moved=$(tip)
push_release
check "exit" "$?" 0
check "main not moved back or rewritten" "$(tip)" "$moved"
check "tag on the commit that was published" "$(origin rev-parse 'v1.1.0^{commit}')" "$published"

echo "release-current.sh"
current() { "$scripts/release-current.sh" 2>/dev/null | tail -1; }
setup
check "main did not move" "$(current)" true
merge_elsewhere .github/workflows/ci.yml
check "moved by .github only: no newer run" "$(current)" true
merge_elsewhere README.md
check "moved by README only: no newer run" "$(current)" true
merge_elsewhere packages/README.md
check "another README: a newer run" "$(current)" false
git remote set-url origin "$root/case/gone.git"
check "main cannot be read" "$(current)" true

echo
if [ "$failures" != 0 ]; then
  echo "$failures failed"
  exit 1
fi
echo "all passed"
