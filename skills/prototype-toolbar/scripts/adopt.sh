#!/usr/bin/env bash
# adopt.sh <slug> — give a static prototype the shared prototype toolbar.
#
# Run in the prototype's root (the folder its pages are served from). Creates
# toolbar/ from the published release line, writes proto-config.js with a
# freshly minted key (an existing one is kept), and prints the two tags to put
# right after <body> on every page.
set -euo pipefail
slug="${1:-}"
[ -n "$slug" ] || { echo "usage: adopt.sh <slug>   (a short lowercase id for this prototype: letters, digits, hyphens — e.g. gl)" >&2; exit 2; }
case "$slug" in *[!a-z0-9-]*|-*) echo "adopt.sh: slug must be lowercase letters, digits and hyphens (e.g. gl, ai-scan)" >&2; exit 2 ;; esac
top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$top" ] && [ "$top" != "$PWD" ] && echo "adopt.sh: note — this is not the repo root ($top); fine if the prototype lives in this subfolder" >&2

LINE="https://effectory-ux.github.io/prototype-toolbar/v1/"
# Fetch the release line's files into a fresh folder and swap it in whole, so a
# failed download never leaves a half-populated toolbar/ behind.
rm -rf toolbar.new && mkdir -p toolbar.new
for f in version.json load.js prototype-bar.js prototype-bar.css update.sh README.md; do
  curl -fsSL --max-time 30 "${LINE}$f" -o "toolbar.new/$f" || { echo "adopt.sh: could not fetch ${LINE}$f" >&2; rm -rf toolbar.new; exit 1; }
done
chmod +x toolbar.new/update.sh
rm -rf toolbar && mv toolbar.new toolbar
echo "toolbar/ ← prototype toolbar $(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' toolbar/version.json | head -1) (release line v1)"

if [ ! -f proto-config.js ]; then
  rand="$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n' | cut -c1-4)"   # bounded read: no early-closed pipe under pipefail
  remote="$(git config --get remote.origin.url 2>/dev/null || true)"
  repo="$(printf '%s\n' "$remote" | sed -nE 's#\.git$##; s#.*github\.com[:/]([^/]+)/([^/]+)$#\1/\2#p')"
  live=""; [ -n "$repo" ] && live="https://${repo%%/*}.github.io/${repo##*/}/"
  cat > proto-config.js <<JS
// proto-config.js — what THIS prototype puts in the shared prototype toolbar
// (toolbar/prototype-bar.js). Host-specific by design; the toolbar knows
// nothing about this prototype. Every field's shape: the toolbar README
// (github.com/effectory-ux/prototype-toolbar, cached by the skill as
// .ds-cache/prototype-toolbar/README.md).
window.PROTO_TOOLBAR = {
  key: "${slug}-${rand}",          // the ?<key>-toolbar-active gate — mint once, never reuse
  prefix: "${slug}",               // localStorage namespace
  name: "${slug}",                 // badge text: use the prototype's real name
  live: "${live}",                 // the deployed address, for the Share menu
  versions: [],                    // [{ key, label, desc, match, go }]
  screens: [],                     // [{ key, label, desc, href, default? }]
  edgeCases: [],                   // [{ key, label, desc, on }]
  variants: []                     // [{ key, label, desc, on, href }]
};
JS
  echo "wrote proto-config.js with key ${slug}-${rand}${live:+ and live $live}"
else
  echo "proto-config.js exists — kept"
fi
key="$(sed -n 's/.*key: *"\([^"]*\)".*/\1/p' proto-config.js | head -1)"
cat <<TXT

Add to every page (the index included), right after <body> opens:

  <script src="proto-config.js"></script>
  <script src="toolbar/load.js"></script>

TXT
if [ -n "$key" ]; then echo "Colleague link: <page>?${key}-toolbar-active"
else echo "Colleague link: <page>?<key>-toolbar-active   (no key: found in proto-config.js — check it)" >&2; fi
