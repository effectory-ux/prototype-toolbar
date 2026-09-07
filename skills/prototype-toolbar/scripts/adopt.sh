#!/usr/bin/env bash
# adopt.sh <slug> — give a static prototype the shared prototype toolbar.
#
# Run in the prototype's root. Creates toolbar/ from the published release line,
# writes proto-config.js with a freshly minted key (if none exists), and prints
# the two tags to put right after <body> on every screen page.
set -euo pipefail
slug="${1:-}"; [ -n "$slug" ] || { echo "usage: adopt.sh <slug>   (a short id for this prototype, e.g. gtma)" >&2; exit 2; }
LINE="https://effectory-ux.github.io/prototype-toolbar/v1/"
mkdir -p toolbar
# Fetch the release line's files directly (the folder is empty, so update.sh
# has nothing to compare against yet); from now on toolbar/update.sh refreshes.
for f in version.json load.js prototype-bar.js prototype-bar.css update.sh README.md; do
  curl -fsSL "${LINE}$f" -o "toolbar/$f" || { echo "adopt.sh: could not fetch ${LINE}$f" >&2; exit 1; }
done
chmod +x toolbar/update.sh
echo "toolbar/ ← prototype toolbar $(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' toolbar/version.json | head -1) (release line v1)"
if [ ! -f proto-config.js ]; then
  # an opaque, readable key: slug plus four random base32 characters
  rand="$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n' | cut -c1-4)" # bounded read: no early-closed pipe under pipefail
  repo="$(git config --get remote.origin.url 2>/dev/null | sed -E 's#.*github.com[:/]([^/]+)/([^/.]+).*#\1/\2#')"
  live=""; [ -n "$repo" ] && live="https://${repo%%/*}.github.io/${repo##*/}/"
  cat > proto-config.js <<JS
// proto-config.js — what THIS prototype puts in the shared prototype toolbar
// (toolbar/prototype-bar.js). Host-specific by design; the toolbar knows
// nothing about this prototype. Shape: toolbar/README.md → full README.
window.PROTO_TOOLBAR = {
  key: "${slug}-${rand}",          // the ?<key>-toolbar-active gate — mint once, never reuse
  prefix: "${slug}",               // localStorage namespace
  name: "${slug}",                 // badge text (use the prototype's real name)
  live: "${live}",                 // the deployed address, for the Share menu
  versions: [],                    // [{ key, label, desc, match, go }]
  screens: [],                     // [{ key, label, desc, href, default? }]
  edgeCases: [],                   // [{ key, label, desc, on }]
  variants: []                     // [{ key, label, desc, on, href }]
};
JS
  echo "wrote proto-config.js with key ${slug}-${rand}"
else
  echo "proto-config.js exists — kept"
fi
cat <<TXT

Add to every screen page, right after <body> opens:

  <script src="proto-config.js"></script>
  <script src="toolbar/load.js"></script>

Colleague link: <page>?$(sed -n 's/.*key: *"\([^"]*\)".*/\1/p' proto-config.js | head -1)-toolbar-active
TXT
