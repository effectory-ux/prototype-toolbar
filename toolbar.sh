#!/usr/bin/env bash
# toolbar.sh — the maintainer's commands for the prototype toolbar.
#
#   toolbar.sh serve [port]      serve THIS clone on http://localhost:8790/ so a
#                                prototype can load the toolbar from your working
#                                tree: open it once with ?proto-toolbar-src=http://localhost:8790/
#                                (…?proto-toolbar-src=off to go back). Edit, reload, see.
#   toolbar.sh vendor [host|all] copy the working tree's runtime files into a static
#                                host's toolbar/ (its vendored copy) — what update.sh
#                                does from the published site, but from here, unreleased
#   toolbar.sh status            every host's toolbar version versus this clone
#   toolbar.sh release <kind>    cut a release (see release.sh): patch | minor | major
#   toolbar.sh unhook            remove the post-commit hooks of the former subtree model
#
# Hosts are listed in hosts.json. Distribution itself needs none of this: static
# prototypes load the published release line (load.js), CYOS installs the npm
# package; this script is for working ON the toolbar.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REG="$HERE/hosts.json"
command -v jq >/dev/null || { echo "toolbar.sh: needs jq" >&2; exit 1; }
expand() { echo "${1/#\~/$HOME}"; }
names()  { jq -r '.hosts[].name' "$REG"; }
hpath()  { expand "$(jq -r --arg n "$1" '.hosts[] | select(.name==$n) | .path' "$REG")"; }
hflav()  { jq -r --arg n "$1" '.hosts[] | select(.name==$n) | .flavor' "$REG"; }
hpkgs()  { jq -r --arg n "$1" '.hosts[] | select(.name==$n) | .packages[]?' "$REG"; }
myver()  { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$HERE/package.json" | head -1; }
RUNTIME="load.js prototype-bar.js prototype-bar.css update.sh"

cmd_serve() {
  local port="${1:-8790}"
  echo "serving $HERE on http://localhost:$port/ — open a prototype once with ?proto-toolbar-src=http://localhost:$port/"
  exec python3 -m http.server "$port" --directory "$HERE"
}
cmd_vendor() {
  local which="${1:-all}" n p
  for n in $(names); do
    [ "$which" = all ] || [ "$which" = "$n" ] || continue
    [ "$(hflav "$n")" = static ] || continue
    p="$(hpath "$n")"; [ -d "$p" ] || { echo "  $n: no clone at $p"; continue; }
    mkdir -p "$p/toolbar"
    for f in $RUNTIME; do cp "$HERE/$f" "$p/toolbar/$f"; done
    cp "$HERE/VENDORED.md" "$p/toolbar/README.md"
    printf '{ "version": "%s", "tag": "", "commit": "%s", "date": "%s" }\n' "$(myver)" "$(git -C "$HERE" rev-parse --short HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$p/toolbar/version.json"
    chmod +x "$p/toolbar/update.sh"
    echo "  $n: vendored $(myver) from the working tree ($p/toolbar/)"
  done
}
cmd_status() {
  echo "this clone: $(myver) @ $(git -C "$HERE" log -1 --format='%h %s')"
  local n p v
  for n in $(names); do
    p="$(hpath "$n")"; [ -d "$p" ] || { echo "  $n: no clone at $p"; continue; }
    if [ "$(hflav "$n")" = static ]; then
      v="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$p/toolbar/version.json" 2>/dev/null | head -1)"
      echo "  $n: vendored ${v:-none}$([ -n "$v" ] && [ "$v" != "$(myver)" ] && echo ' (differs from this clone)')   ($p)"
    else
      local pk; for pk in $(hpkgs "$n"); do
        v="$(sed -n 's/.*"prototype-toolbar": *"\([^"]*\)".*/\1/p' "$p/$pk/package.json" 2>/dev/null | head -1)"
        local inst; inst="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$p/$pk/node_modules/prototype-toolbar/package.json" 2>/dev/null | head -1)"
        echo "  $n/$pk: depends on ${v:-nothing}, installed ${inst:-none}"
      done
    fi
  done
}
cmd_unhook() {
  local n p f
  for p in "$HERE" $(for n in $(names); do hpath "$n"; done); do
    f="$p/.git/hooks/post-commit"
    [ -f "$f" ] && grep -q "prototype-toolbar sync" "$f" || continue
    python3 - "$f" <<'PY'
import sys,re
f=sys.argv[1]; s=open(f).read()
s=re.sub(r"# prototype-toolbar sync begin.*?# prototype-toolbar sync end\n", "", s, flags=re.S)
if s.strip() in ("", "#!/usr/bin/env bash"): import os; os.remove(f)
else: open(f,"w").write(s)
PY
    echo "  $(basename "$p"): hook removed"
  done
}
case "${1:-status}" in
  serve)   shift; cmd_serve "$@" ;;
  vendor)  shift; cmd_vendor "$@" ;;
  status)  cmd_status ;;
  release) shift; exec "$HERE/release.sh" "$@" ;;
  unhook)  cmd_unhook ;;
  -h|--help|help) sed -n '2,18p' "$0" ;;
  *) echo "toolbar.sh: unknown command '$1' (serve | vendor | status | release | unhook)" >&2; exit 2 ;;
esac
