#!/usr/bin/env bash
# toolbar-skill.sh — the prototype-toolbar skill fetches its own content live.
#
#   toolbar-skill.sh sync           refresh guide.md, adopt.sh and the toolbar README
#   toolbar-skill.sh adopt <slug>   give a static prototype the toolbar (runs the freshest adopt.sh)
#   toolbar-skill.sh status         what is cached, how old, and bundle vs repo version
#
# Every successful fetch lands in .ds-cache/prototype-toolbar/ in the current
# directory (the project); the cache is only ever replaced by a successful
# download, never emptied on failure. The files next to this script are the
# cold-start copy: they seed the cache on first use and are the offline fallback.
# `sync` also says when the BUNDLE itself is behind the repo — SKILL.md or this
# script changed — because that is the one thing a fetch cannot fix.
#
# Same shape as the design-system skill's ds-skill.sh, on purpose.
# Env overrides: PROTO_TOOLBAR_REF (branch or tag, default main), PROTO_TOOLBAR_CACHE.
set -uo pipefail
REPO="effectory-ux/prototype-toolbar"
REF="${PROTO_TOOLBAR_REF:-main}"
RAW="https://raw.githubusercontent.com/$REPO/$REF"
SKILL="$RAW/skills/prototype-toolbar"
LINE="https://effectory-ux.github.io/prototype-toolbar/v1/version.json"
CACHE="${PROTO_TOOLBAR_CACHE:-.ds-cache/prototype-toolbar}"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$CACHE"

sha12() { python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest()[:12])' "$1" 2>/dev/null; }
ver_of() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$1" 2>/dev/null | head -1; }

seed() {  # <bundle-file> <cache-file>: cold start, only when the cache has nothing
  [ -s "$2" ] && return 0
  [ -s "$1" ] || return 0
  cp "$1" "$2" && echo "  · seeded $(basename "$2") from the bundle"
}
fetch() {  # <url> <cache-path> <label>
  local tmp; tmp="$(mktemp)"
  if curl -fsSL --max-time 20 "$1" -o "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    mv "$tmp" "$2"; echo "  ✓ $3 (fetched)"; return 0
  fi
  rm -f "$tmp"
  if [ -s "$2" ]; then echo "  ~ $3 (offline — using cached copy from $(date -r "$2" '+%d %b %H:%M' 2>/dev/null || echo earlier))"; return 0; fi
  echo "  ✗ $3 — not reachable and nothing cached"; return 1
}

bundle_notice() {  # the one thing a fetch cannot fix: this bundle is behind the repo
  local changed=""
  [ -s "$CACHE/SKILL.md" ] && [ "$(sha12 "$SKILL_DIR/SKILL.md")" != "$(sha12 "$CACHE/SKILL.md")" ] && changed="the instructions (SKILL.md)"
  [ -s "$CACHE/toolbar-skill.sh" ] && [ "$(sha12 "${BASH_SOURCE[0]}")" != "$(sha12 "$CACHE/toolbar-skill.sh")" ] && changed="${changed:+$changed and }toolbar-skill.sh"
  if [ -n "$changed" ]; then
    echo "  ⚠ The skill bundle is outdated: $changed changed in the repo."
    echo "    Tell the user once — the admin re-uploads the skill in Claude.ai — and work on with the current instructions."
  fi
}

cmd_sync() {
  echo "→ Prototype toolbar skill"
  local f
  for f in guide.md adopt.sh README.md; do seed "$SKILL_DIR/$f" "$CACHE/$f"; done
  seed "$SKILL_DIR/scripts/adopt.sh" "$CACHE/adopt.sh"
  fetch "$SKILL/guide.md" "$CACHE/guide.md" "guide.md" || exit 1
  fetch "$SKILL/scripts/adopt.sh" "$CACHE/adopt.sh" "adopt.sh" || true
  fetch "$RAW/README.md" "$CACHE/README.md" "toolbar README" || true
  fetch "$SKILL/SKILL.md" "$CACHE/SKILL.md" "SKILL.md (for the bundle check)" >/dev/null || true
  fetch "$SKILL/toolbar-skill.sh" "$CACHE/toolbar-skill.sh" "toolbar-skill.sh (for the bundle check)" >/dev/null || true
  fetch "$RAW/package.json" "$CACHE/package.json" "repo version" >/dev/null || true
  fetch "$LINE" "$CACHE/version.json" "published release" >/dev/null || true
  chmod +x "$CACHE/adopt.sh" 2>/dev/null
  echo "  repo v$(ver_of "$CACHE/package.json" || echo '?') · published release line v1 = $(ver_of "$CACHE/version.json" || echo '?')"
  bundle_notice
}
cmd_adopt() {
  [ -s "$CACHE/adopt.sh" ] || { seed "$SKILL_DIR/scripts/adopt.sh" "$CACHE/adopt.sh"; }
  [ -s "$CACHE/adopt.sh" ] || { echo "  ✗ no adopt.sh — run ./toolbar-skill.sh sync first"; exit 1; }
  bash "$CACHE/adopt.sh" "$@"
}
cmd_status() {
  if [ -s "$CACHE/guide.md" ]; then
    echo "  cached guide    : $(date -r "$CACHE/guide.md" '+%d %b %H:%M' 2>/dev/null) ($(wc -l < "$CACHE/guide.md" | tr -d ' ') lines)"
    echo "  cached files    : $(ls "$CACHE" | tr '\n' ' ')"
    echo "  repo version    : $(ver_of "$CACHE/package.json" || echo '?')   published v1: $(ver_of "$CACHE/version.json" || echo '?')"
    [ -s toolbar/version.json ] && echo "  this prototype  : toolbar/ at $(ver_of toolbar/version.json)"
    bundle_notice
  else
    echo "  nothing cached yet — run: ./toolbar-skill.sh sync"
  fi
}
case "${1:-sync}" in
  sync)   cmd_sync ;;
  adopt)  shift; cmd_adopt "$@" ;;
  status) cmd_status ;;
  *) echo "usage: toolbar-skill.sh [sync|adopt <slug>|status]"; exit 1 ;;
esac
