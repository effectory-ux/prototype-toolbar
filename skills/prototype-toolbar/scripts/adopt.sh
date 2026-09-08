#!/usr/bin/env bash
# adopt.sh — give a static prototype the shared prototype toolbar, or print its links.
#
#   adopt.sh <slug>          wire it: fetch toolbar/ from the release line, write proto-config.js
#                            with a fresh key (an existing one is kept), put the two tags on every
#                            page that lacks them, then print the links. Safe to run again.
#   adopt.sh inject          only the tags: every *.html page that lacks them gets them
#   adopt.sh link [page]     the colleague link and the tester link for a page (default: the
#                            prototype's first page), for localhost and for the live site
#
# Without the skill, straight from the release line (run in the prototype's root):
#   curl -fsSL https://effectory-ux.github.io/prototype-toolbar/v1/adopt.sh | bash -s -- <slug>
#   curl -fsSL https://effectory-ux.github.io/prototype-toolbar/v1/adopt.sh | bash -s -- link
#
# Local links assume the team's serve.py (port 3000; PORT overrides). A slug is a
# short lowercase id for the prototype: letters, digits, hyphens.
set -euo pipefail
LINE="${PROTO_TOOLBAR_LINE:-https://effectory-ux.github.io/prototype-toolbar/v1/}"  # env override: test an unreleased line
CONFIG="proto-config.js"
PORT="${PORT:-3000}"

cfg() { sed -n "s/.*$1: *\"\([^\"]*\)\".*/\1/p" "$CONFIG" 2>/dev/null | head -1; }
first_page() {  # the prototype's landing page: index.html, else the first page at the root
  if [ -f index.html ]; then echo index.html; else ls *.html 2>/dev/null | head -1; fi
}

# ---- links ---------------------------------------------------------------------
cmd_link() {
  [ -s "$CONFIG" ] || { echo "adopt.sh: no $CONFIG here — this prototype has no toolbar yet. Wire it: adopt.sh <slug>" >&2; exit 1; }
  local key live page; key="$(cfg key)"; live="$(cfg live)"; page="${1:-$(first_page)}"
  [ -n "$key" ] || { echo "adopt.sh: $CONFIG has no key: — add one (e.g. \"<slug>-a1b2\")" >&2; exit 1; }
  page="${page#./}"; local p="$page"; [ "$p" = index.html ] && p=""
  echo "Prototype: $(cfg name)   key: $key   page: ${page}"
  echo
  echo "Colleague link (with the toolbar):"
  echo "  local  http://localhost:$PORT/$p?$key-toolbar-active"
  [ -n "$live" ] && echo "  live   ${live%/}/$p?$key-toolbar-active" || echo "  live   (set live: in $CONFIG to the Pages address)"
  echo "Tester link (no toolbar, ever):"
  echo "  local  http://localhost:$PORT/$p"
  [ -n "$live" ] && echo "  live   ${live%/}/$p"
  echo
  echo "Serve locally with: python3 -m http.server $PORT   (or the project's serve.py)"
}

# ---- tags ----------------------------------------------------------------------
cmd_inject() {  # every page that lacks toolbar/load.js gets the two tags right after <body>
  python3 - <<'PY'
import re, os, sys
skip = ('toolbar', 'node_modules', '.ds-cache', 'dist', '.git')
done, had, nobody = [], [], []
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in skip and not d.startswith('.')]
    for f in sorted(files):
        if not f.endswith(('.html', '.htm')): continue
        path = os.path.normpath(os.path.join(root, f))
        s = open(path, encoding='utf-8', errors='surrogateescape').read()
        if 'toolbar/load.js' in s: had.append(path); continue
        m = re.search(r'<body[^>]*>', s, re.I)
        if not m: nobody.append(path); continue
        depth = path.count(os.sep)
        rel = '' if re.search(r'<base\s', s, re.I) else '../' * depth
        tags = f'\n  <script src="{rel}proto-config.js"></script>\n  <script src="{rel}toolbar/load.js"></script>'
        s = s[:m.end()] + tags + s[m.end():]
        # a redirect-only page keeps redirecting, but now honours a chosen start and carries the flag
        r = re.search(r'\s*<meta\s+http-equiv=["\']refresh["\'][^>]*url=([^"\'>\s;]+)[^>]*>', s, re.I)
        if r:
            target = r.group(1)
            s = s[:r.start()] + s[r.end():]
            s = s.replace(tags, tags + f'\n  <script>location.replace(ProtoToolbar.carry(ProtoToolbar.startPath() || "{target}"));</script>', 1)
        open(path, 'w', encoding='utf-8', errors='surrogateescape').write(s)
        done.append(path)
if done: print("  tags added to: " + ", ".join(done))
if had:  print(f"  already had them: {len(had)} page(s)")
for p in nobody: print(f"  ! {p}: no <body> tag — add the two tags by hand")
if not done and not had: print("  no .html pages found here — is this the prototype's root?")
PY
}

# ---- adopt ---------------------------------------------------------------------
cmd_adopt() {
  local slug="$1"
  case "$slug" in *[!a-z0-9-]*|-*) echo "adopt.sh: slug must be lowercase letters, digits and hyphens (e.g. gl, ai-scan)" >&2; exit 2 ;; esac
  local top; top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$top" ] && [ "$top" != "$PWD" ] && echo "adopt.sh: note — this is not the repo root ($top); fine if the prototype lives in this subfolder" >&2

  # Fetch the release line's files into a fresh folder and swap it in whole, so a
  # failed download never leaves a half-populated toolbar/ behind.
  rm -rf toolbar.new && mkdir -p toolbar.new
  local f
  for f in version.json load.js prototype-bar.js prototype-bar.css update.sh adopt.sh README.md; do
    curl -fsSL --max-time 30 "${LINE}$f" -o "toolbar.new/$f" || { echo "adopt.sh: could not fetch ${LINE}$f" >&2; rm -rf toolbar.new; exit 1; }
  done
  chmod +x toolbar.new/update.sh toolbar.new/adopt.sh
  rm -rf toolbar && mv toolbar.new toolbar
  echo "toolbar/ ← prototype toolbar $(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' toolbar/version.json | head -1) (release line v1)"

  if [ ! -f "$CONFIG" ]; then
    local rand remote repo live=""
    rand="$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n' | cut -c1-4)"   # bounded read: no early-closed pipe under pipefail
    remote="$(git config --get remote.origin.url 2>/dev/null || true)"
    repo="$(printf '%s\n' "$remote" | sed -nE 's#\.git$##; s#.*github\.com[:/]([^/]+)/([^/]+)$#\1/\2#p')"
    [ -n "$repo" ] && live="https://${repo%%/*}.github.io/${repo##*/}/"
    cat > "$CONFIG" <<JS
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
    echo "wrote $CONFIG with key ${slug}-${rand}${live:+ and live $live}"
  else
    echo "$CONFIG exists — kept"
  fi
  cmd_inject
  echo
  cmd_link
  echo
  echo "Next: in $CONFIG set name and screens (the Screens menu), and check one page with the colleague link."
}

case "${1:-}" in
  "")      sed -n '2,15p' "$0" 2>/dev/null || echo "usage: adopt.sh <slug> | inject | link [page]"; exit 2 ;;
  link)    shift; cmd_link "$@" ;;
  inject)  cmd_inject ;;
  *)       cmd_adopt "$1" ;;
esac
