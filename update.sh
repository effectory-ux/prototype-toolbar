#!/usr/bin/env bash
# update.sh — refresh this folder's copy of the prototype toolbar from its
# published release line (https://effectory-ux.github.io/prototype-toolbar/v<MAJOR>/).
#
#   toolbar/update.sh        # latest release on the line this copy follows
#   toolbar/update.sh 2      # move to release line 2 (a new major: check the changelog first)
#
# The copy in this folder is the FALLBACK (deployed) and the FIRST CHOICE
# (localhost); see load.js. Never edit these files here — change the toolbar
# in github.com/effectory-ux/prototype-toolbar and release it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAJOR="${1:-$(sed -n 's/.*var MAJOR = "\([0-9]*\)".*/\1/p' "$HERE/load.js" | head -1)}"
BASE="https://effectory-ux.github.io/prototype-toolbar/v${MAJOR}/"
FILES="version.json load.js prototype-bar.js prototype-bar.css update.sh README.md"
before="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$HERE/version.json" 2>/dev/null | head -1)"
tmp="$(mktemp -d)"
for f in $FILES; do
  curl -fsSL "$BASE$f" -o "$tmp/$f" || { echo "update.sh: could not fetch $BASE$f" >&2; rm -rf "$tmp"; exit 1; }
done
for f in $FILES; do mv "$tmp/$f" "$HERE/$f"; done
chmod +x "$HERE/update.sh"; rm -rf "$tmp"
after="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$HERE/version.json" | head -1)"
echo "prototype toolbar: ${before:-?} → $after (release line v$MAJOR)"
