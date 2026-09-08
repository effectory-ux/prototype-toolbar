#!/usr/bin/env bash
# toolbar-skill.sh — the prototype-toolbar skill fetches its own content live.
#
#   toolbar-skill.sh sync           refresh guide.md, adopt.sh and the toolbar README
#   toolbar-skill.sh adopt <slug>   give a static prototype the toolbar (runs the freshest adopt.sh)
#   toolbar-skill.sh link [page]    the prototype's colleague link and tester link, local and live
#   toolbar-skill.sh inject         the two tags on every page that lacks them
#   toolbar-skill.sh status         what is cached, how old, and bundle vs repo version
#
# Run it by its path from the PROTOTYPE'S ROOT: every successful fetch lands in
# .ds-cache/prototype-toolbar/ in the current directory, and the cache is only
# ever replaced by a successful download, never emptied on failure. The files
# next to this script are the cold-start copy: they seed the cache on first use
# and are the offline fallback. `sync` also says when the BUNDLE itself is
# behind the repo — SKILL.md or this script changed — because that is the one
# thing a fetch cannot fix.
#
# Same shape as the design-system skill's ds-skill.sh, on purpose.
# Env overrides: PROTO_TOOLBAR_REF (branch or tag, default main), PROTO_TOOLBAR_CACHE.
set -uo pipefail
REPO="effectory-ux/prototype-toolbar"
REF="${PROTO_TOOLBAR_REF:-main}"
# raw.githubusercontent.com caches a branch URL for five minutes, so a sync right
# after a push could fetch yesterday's guide over today's bundle. Resolve the
# branch to its current commit first: a commit URL is immutable, never stale.
# If the API is unreachable (offline, rate-limited) the branch name still works.
resolve_ref() {
  local sha
  sha="$(curl -fsSL --max-time 10 -H 'Accept: application/vnd.github.sha' "https://api.github.com/repos/$REPO/commits/$REF" 2>/dev/null)"
  case "$sha" in [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) echo "$sha" ;; *) echo "$REF" ;; esac
}
PIN="$(resolve_ref)"
RAW="https://raw.githubusercontent.com/$REPO/$PIN"
SKILL="$RAW/skills/prototype-toolbar"
LINE="https://effectory-ux.github.io/prototype-toolbar/v1/version.json"
CACHE="${PROTO_TOOLBAR_CACHE:-.ds-cache/prototype-toolbar}"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$CACHE" || { echo "  ✗ cannot create $CACHE — run this from the prototype's root, not from the skill folder" >&2; exit 1; }
[ -w "$CACHE" ] || { echo "  ✗ $CACHE is not writable — run this from the prototype's root" >&2; exit 1; }

sha12() { { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1" 2>/dev/null; } | cut -c1-12; }
ver_of() { local v; v="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$1" 2>/dev/null | head -1)"; echo "${v:-?}"; }
bundle_v() { local v=""; [ -s "$SKILL_DIR/VERSION" ] && v="$(tr -d '[:space:]' < "$SKILL_DIR/VERSION")"; [ -n "$v" ] || v="$(ver_of "$SKILL_DIR/../../package.json")"; echo "$v"; }

seed() {  # <bundle-file> <cache-file>: cold start, only when the cache has nothing
  [ -s "$2" ] && return 0
  [ -s "$1" ] || return 0
  cp "$1" "$2" && echo "  · seeded $(basename "$2") from the bundle"
}
fetch() {  # <url> <cache-path> <label>  — the temp file lives in the cache dir, so the final move is an atomic rename
  local tmp code
  tmp="$(mktemp "$CACHE/.fetch.XXXXXX")" || return 1
  code="$(curl -sSL --max-time 20 -w '%{http_code}' "$1" -o "$tmp" 2>/dev/null)"
  if [ "$code" = 200 ] && [ -s "$tmp" ]; then
    mv "$tmp" "$2" || { rm -f "$tmp"; echo "  ✗ $3 — cannot write $2"; return 1; }
    echo "  ✓ $3 (fetched)"; return 0
  fi
  rm -f "$tmp"
  local why="unreachable"; [ -n "$code" ] && [ "$code" != 000 ] && why="HTTP $code"
  if [ -s "$2" ]; then echo "  ~ $3 ($why — using cached copy from $(date -r "$2" '+%d %b %H:%M' 2>/dev/null || echo earlier))"; return 0; fi
  echo "  ✗ $3 — $why and nothing cached"; return 1
}
gitignore_cache() {  # a project that is a git repo gets .ds-cache/ ignored, once
  [ -d .git ] || git rev-parse --show-toplevel >/dev/null 2>&1 || return 0
  grep -qs '^\.ds-cache/\?$' .gitignore 2>/dev/null && return 0
  printf '.ds-cache/\n' >> .gitignore && echo "  · added .ds-cache/ to .gitignore"
}
bundle_notice() {  # the one thing a fetch cannot fix: this bundle is behind the repo
  local changed="" a b
  if [ -s "$CACHE/SKILL.md" ] && [ -s "$SKILL_DIR/SKILL.md" ]; then
    a="$(sha12 "$SKILL_DIR/SKILL.md")"; b="$(sha12 "$CACHE/SKILL.md")"
    [ -n "$a" ] && [ -n "$b" ] && [ "$a" != "$b" ] && changed="the instructions (SKILL.md)"
  fi
  if [ -s "$CACHE/toolbar-skill.sh" ]; then
    a="$(sha12 "${BASH_SOURCE[0]}")"; b="$(sha12 "$CACHE/toolbar-skill.sh")"
    [ -n "$a" ] && [ -n "$b" ] && [ "$a" != "$b" ] && changed="${changed:+$changed and }toolbar-skill.sh"
  fi
  if [ -n "$changed" ]; then
    echo "  ⚠ The skill bundle is outdated: $changed changed in the repo (bundle v$(bundle_v), repo v$(ver_of "$CACHE/package.json"))."
    echo "    Tell the user once — the admin re-uploads the zip in Claude.ai, or for a plugin install: claude plugin update prototype-toolbar — and work on with the current instructions."
  fi
}

cmd_sync() {
  echo "→ Prototype toolbar skill"
  seed "$SKILL_DIR/guide.md" "$CACHE/guide.md"
  seed "$SKILL_DIR/scripts/adopt.sh" "$CACHE/adopt.sh"
  seed "$SKILL_DIR/README.md" "$CACHE/README.md"          # the zip carries a copy of the repo README…
  seed "$SKILL_DIR/../../README.md" "$CACHE/README.md"    # …a plugin/checkout has it two folders up
  fetch "$SKILL/guide.md" "$CACHE/guide.md" "guide.md" || exit 1
  fetch "$SKILL/scripts/adopt.sh" "$CACHE/adopt.sh" "adopt.sh" || true
  fetch "$RAW/README.md" "$CACHE/README.md" "toolbar README" || true
  fetch "$SKILL/SKILL.md" "$CACHE/SKILL.md" "SKILL.md (for the bundle check)" >/dev/null || true
  fetch "$SKILL/toolbar-skill.sh" "$CACHE/toolbar-skill.sh" "toolbar-skill.sh (for the bundle check)" >/dev/null || true
  fetch "$RAW/package.json" "$CACHE/package.json" "repo version" >/dev/null || true
  fetch "$LINE" "$CACHE/version.json" "published release" >/dev/null || true
  chmod +x "$CACHE/adopt.sh" 2>/dev/null
  gitignore_cache
  echo "  repo v$(ver_of "$CACHE/package.json") @ ${PIN:0:7} · published release line v1 = $(ver_of "$CACHE/version.json") · bundle v$(bundle_v)"
  bundle_notice
}
run_adopt() {  # adopt.sh, the freshest one (the cached or bundled one offline), with the given mode
  seed "$SKILL_DIR/scripts/adopt.sh" "$CACHE/adopt.sh"
  fetch "$SKILL/scripts/adopt.sh" "$CACHE/adopt.sh" "adopt.sh" >/dev/null || true
  [ -s "$CACHE/adopt.sh" ] || { echo "  ✗ no adopt.sh — run sync first"; exit 1; }
  bash "$CACHE/adopt.sh" "$@"
}
cmd_adopt() { run_adopt "$@"; }
cmd_status() {
  if [ -s "$CACHE/guide.md" ]; then
    echo "  cached guide    : $(date -r "$CACHE/guide.md" '+%d %b %H:%M' 2>/dev/null) ($(wc -l < "$CACHE/guide.md" | tr -d ' ') lines)"
    echo "  cached files    : $(ls "$CACHE" | grep -v '^\.fetch' | tr '\n' ' ')"
    echo "  repo version    : $(ver_of "$CACHE/package.json")   published v1: $(ver_of "$CACHE/version.json")   bundle: $(bundle_v)"
    [ -s toolbar/version.json ] && echo "  this prototype  : toolbar/ at $(ver_of toolbar/version.json)"
    bundle_notice
  else
    echo "  nothing cached yet — run: toolbar-skill.sh sync"
  fi
}
case "${1:-sync}" in
  sync)   cmd_sync ;;
  adopt)  shift; cmd_adopt "$@" ;;
  link)   shift; run_adopt link "$@" ;;
  inject) run_adopt inject ;;
  status) cmd_status ;;
  *) echo "usage: toolbar-skill.sh [sync|adopt <slug>|link [page]|inject|status]"; exit 1 ;;
esac
