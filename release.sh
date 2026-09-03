#!/usr/bin/env bash
# release.sh patch|minor|major — cut a release of the toolbar.
#
# Bumps the version (semver: patch = fix, minor = new feature, major = a
# change that breaks hosts — new config shape, removed API), stamps it into
# package.json and prototype-bar.js, commits, tags v<X.Y.Z> and pushes. The
# Pages workflow then publishes /v<X.Y.Z>/ and moves the /v<X>/ release line.
# Static prototypes pick it up on their next load (deployed) or after
# toolbar/update.sh (their vendored copy); CYOS after `npm update prototype-toolbar`.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
kind="${1:-}"; case "$kind" in patch|minor|major) ;; *) echo "usage: release.sh patch|minor|major" >&2; exit 2 ;; esac
[ -z "$(git status --porcelain)" ] || { echo "release.sh: commit or stash your changes first" >&2; exit 1; }
git fetch -q origin && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "release.sh: main is not in sync with origin/main — pull/push first" >&2; exit 1; }
new="$(npm version "$kind" --no-git-tag-version)"; new="${new#v}"
sed -i '' "s/var VERSION = \"[^\"]*\"/var VERSION = \"$new\"/" prototype-bar.js
sed -i '' "s/var MAJOR = \"[^\"]*\"/var MAJOR = \"${new%%.*}\"/" load.js
git add package.json prototype-bar.js load.js
git commit -q -m "Release v$new"
git tag -a "v$new" -m "Release v$new"
git push -q origin main "v$new"
echo "released v$new — Pages publishes /v$new/ and /v${new%%.*}/ in a minute (gh run watch)"
