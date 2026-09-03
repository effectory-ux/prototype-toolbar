#!/usr/bin/env bash
# sync.sh — keeps ONE toolbar in step across every prototype that embeds it.
#
# The canonical copy lives in the prototype-toolbar repo (the "upstream", a
# local clone of github.com/effectory-ux/prototype-toolbar). Every host
# prototype carries it as a git subtree at toolbar/. Both sides get edited —
# a toolbar tweak happens wherever you happen to be working — so this script
# moves changes in BOTH directions, entirely locally, without any GitHub
# round-trip:
#
#   sync.sh status              where every host stands versus upstream
#   sync.sh in  [host|all]      harvest toolbar commits made INSIDE a host
#                               into upstream (git subtree split + merge)
#   sync.sh out [--except h]    bring every host up to upstream HEAD
#                               (git subtree pull, one commit per host)
#   sync.sh mirror [host]       copy the upstream WORKING TREE into a host's
#                               toolbar/ without committing — for trying an
#                               edit in a real prototype right now
#   sync.sh watch               keep mirroring while you edit (polls 1s)
#   sync.sh hooks               install the post-commit hooks that run
#                               `in` + `out` automatically after every commit
#                               (in upstream and in every host)
#   sync.sh push                push upstream AND every host to GitHub
#
# The registry of hosts is hosts.json next to this script (the same file
# ships inside every host's toolbar/, so `toolbar/sync.sh` works from a host
# too). Set PROTO_SYNC_QUIET=1 to keep hook output to one line per host.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REG="$HERE/hosts.json"
[ -f "$REG" ] || { echo "sync.sh: hosts.json not found next to the script" >&2; exit 1; }
command -v jq >/dev/null || { echo "sync.sh: needs jq" >&2; exit 1; }

expand() { local p="$1"; echo "${p/#\~/$HOME}"; }
UP="$(expand "$(jq -r .upstream.path "$REG")")"
[ -d "$UP/.git" ] || { echo "sync.sh: upstream clone not found at $UP (hosts.json → upstream.path)" >&2; exit 1; }

# A sync run makes commits; the hooks those commits fire must not start a
# second run. Every git call below inherits this.
export PROTO_SYNC=1

names()  { jq -r '.hosts[].name' "$REG"; }
hpath()  { expand "$(jq -r --arg n "$1" '.hosts[] | select(.name==$n) | .path' "$REG")"; }
hrepo()  { jq -r --arg n "$1" '.hosts[] | select(.name==$n) | .repo' "$REG"; }
say()    { printf '%s\n' "$*"; }
note()   { [ "${PROTO_SYNC_QUIET:-}" = 1 ] || printf '%s\n' "$*"; }

up_head()      { git -C "$UP" rev-parse HEAD; }
up_tree()      { git -C "$UP" rev-parse 'HEAD^{tree}'; }
host_tree()    { git -C "$1" rev-parse -q --verify 'HEAD:toolbar' 2>/dev/null || true; }
host_dirty()   { [ -n "$(git -C "$1" status --porcelain -- toolbar)" ]; }
has_toolbar()  { [ -d "$1/toolbar" ] && [ -n "$(host_tree "$1")" ]; }
# Is the host's toolbar/ working tree byte-identical to upstream's?
same_as_up()   { diff -rq -x .git "$UP" "$1/toolbar" >/dev/null 2>&1; }
# git subtree refuses to run in a repo with uncommitted TRACKED changes, even
# unrelated ones. Park those in the stash for the duration of one operation
# and put them back afterwards (untracked files stay where they are).
with_clean_tree() { # <repo> <command...>
  local r="$1"; shift
  local stashed=0 rc=0
  if [ -n "$(git -C "$r" status --porcelain --untracked-files=no)" ]; then
    git -C "$r" stash push -q -m "sync.sh: parked edits during a toolbar sync" && stashed=1
  fi
  "$@" || rc=$?
  [ "$stashed" = 1 ] && { git -C "$r" stash pop -q || say "  ($r: could not restore parked edits — see git stash list)"; }
  return $rc
}

check_host() {
  local n="$1" p; p="$(hpath "$n")"
  [ -d "$p/.git" ] || { say "  $n: no local clone at $p — git clone https://github.com/$(hrepo "$n").git \"$p\""; return 1; }
  has_toolbar "$p" || { say "  $n: has no toolbar/ subtree yet (see README: adopting the toolbar)"; return 1; }
}

# ---- status -----------------------------------------------------------------
cmd_status() {
  say "upstream  $UP  @ $(git -C "$UP" log -1 --format='%h %s')"
  [ -z "$(git -C "$UP" status --porcelain)" ] || say "          (uncommitted changes in upstream)"
  local n p split ut
  ut="$(up_tree)"
  for n in $(names); do
    p="$(hpath "$n")"
    check_host "$n" >/dev/null 2>&1 || { check_host "$n"; continue; }
    local state
    if [ "$(host_tree "$p")" = "$ut" ]; then state="in sync"
    else
      split="$(git -C "$p" subtree split --prefix=toolbar 2>/dev/null || true)"
      if [ -n "$split" ] && git -C "$UP" cat-file -e "$split" 2>/dev/null && git -C "$UP" merge-base --is-ancestor "$split" HEAD; then state="BEHIND upstream → sync.sh out"
      elif [ -n "$split" ] && git -C "$UP" cat-file -e "$split" 2>/dev/null && git -C "$UP" merge-base --is-ancestor HEAD "$split"; then state="AHEAD of upstream → sync.sh in $n"
      else state="DIVERGED from upstream → sync.sh in $n, then sync.sh out"; fi
    fi
    if host_dirty "$p"; then
      if same_as_up "$p"; then state="$state; toolbar/ mirrored from upstream working tree (uncommitted)"
      else state="$state; UNCOMMITTED edits in toolbar/ — commit them, then sync.sh in $n"; fi
    fi
    say "  $n: $state   ($p)"
  done
}

# ---- in: host → upstream --------------------------------------------------------
cmd_in() {
  local which="${1:-all}" n
  for n in $(names); do
    [ "$which" = all ] || [ "$which" = "$n" ] || continue
    check_host "$n" || continue
    local p; p="$(hpath "$n")"
    if host_dirty "$p"; then
      same_as_up "$p" && { note "  $n: toolbar/ only carries a mirror of upstream — nothing to harvest"; continue; }
      say "  $n: toolbar/ has uncommitted edits — commit them first, then run: sync.sh in $n"; continue
    fi
    local split
    split="$(git -C "$p" subtree split --prefix=toolbar 2>/dev/null)" || { say "  $n: git subtree split failed"; continue; }
    git -C "$UP" fetch -q "$p" "$split" 2>/dev/null || { say "  $n: could not fetch split $split from $p"; continue; }
    if git -C "$UP" merge-base --is-ancestor "$split" HEAD; then note "  $n: nothing new for upstream"; continue; fi
    if with_clean_tree "$UP" git -C "$UP" merge -q --ff-only "$split" 2>/dev/null; then
      say "  $n: upstream fast-forwarded to $(git -C "$UP" log -1 --format='%h %s')"
    elif with_clean_tree "$UP" git -C "$UP" merge -q --no-edit -m "Merge toolbar changes made in $n" "$split"; then
      say "  $n: merged into upstream → $(git -C "$UP" log -1 --format='%h %s')"
    else
      git -C "$UP" merge --abort 2>/dev/null || true
      say "  $n: MERGE CONFLICT with upstream — resolve by hand: cd $UP && git merge $split"
    fi
  done
}

# ---- out: upstream → hosts --------------------------------------------------------
# A host that was squash-added pulls squashed; the origin host (CYOS, whose
# history the upstream was split from) cannot squash and merges instead.
pull_host() { # <host path> <subject>
  git -C "$1" subtree pull -q --prefix=toolbar "$UP" main --squash -m "Pull the shared toolbar: $2" >/dev/null 2>&1 \
    || { git -C "$1" merge --abort >/dev/null 2>&1 || true
         git -C "$1" subtree pull -q --prefix=toolbar "$UP" main -m "Pull the shared toolbar: $2" >/dev/null 2>&1; }
}
cmd_out() {
  local except="" n
  [ "${1:-}" = "--except" ] && except="${2:-}"
  local ut; ut="$(up_tree)"
  for n in $(names); do
    [ "$n" = "$except" ] && continue
    check_host "$n" || continue
    local p; p="$(hpath "$n")"
    if [ "$(host_tree "$p")" = "$ut" ]; then
      # Committed state is current; drop a stale mirror if one is lying around.
      if host_dirty "$p" && same_as_up "$p"; then git -C "$p" checkout -q -- toolbar; git -C "$p" clean -fdq -- toolbar; fi
      note "  $n: already at upstream"; continue
    fi
    if host_dirty "$p"; then
      if same_as_up "$p"; then git -C "$p" checkout -q -- toolbar; git -C "$p" clean -fdq -- toolbar
      else say "  $n: toolbar/ has uncommitted edits — commit them (then sync.sh in $n) before pulling"; continue; fi
    fi
    local split
    split="$(git -C "$p" subtree split --prefix=toolbar 2>/dev/null || true)"
    if [ -n "$split" ] && git -C "$UP" cat-file -e "$split" 2>/dev/null && ! git -C "$UP" merge-base --is-ancestor "$split" HEAD; then
      say "  $n: has toolbar commits upstream lacks — run sync.sh in $n first"; continue
    fi
    local subj; subj="$(git -C "$UP" log -1 --format='%s')"
    if with_clean_tree "$p" pull_host "$p" "$subj"; then
      say "  $n: pulled → $(git -C "$p" log -1 --format='%h %s')"
    else
      git -C "$p" merge --abort 2>/dev/null || true
      say "  $n: subtree pull FAILED — try by hand: cd $p && git subtree pull --prefix=toolbar $UP main --squash"
    fi
  done
}

# ---- mirror / watch: working tree → hosts, no commits ---------------------------
cmd_mirror() {
  local which="${1:-all}" n
  for n in $(names); do
    [ "$which" = all ] || [ "$which" = "$n" ] || continue
    check_host "$n" >/dev/null 2>&1 || continue
    local p; p="$(hpath "$n")"
    if host_dirty "$p" && ! same_as_up "$p"; then say "  $n: toolbar/ has its own uncommitted edits — not overwriting"; continue; fi
    rsync -a --delete --exclude .git "$UP/" "$p/toolbar/"
    note "  $n: mirrored"
  done
}
cmd_watch() {
  say "watching $UP — every change is mirrored into each host's toolbar/ (Ctrl+C to stop)"
  local stamp; stamp="$(mktemp)"
  cmd_mirror all
  while sleep 1; do
    if [ -n "$(find "$UP" -type f -not -path '*/.git/*' -newer "$stamp" -print -quit)" ]; then
      touch "$stamp"; PROTO_SYNC_QUIET=1 cmd_mirror all; say "  $(date +%H:%M:%S) mirrored"
    fi
  done
}

# ---- hooks -----------------------------------------------------------------------
HOOK_MARK="# prototype-toolbar sync"
install_hook() { # <repo path> <script body>
  local dir="$1/.git/hooks" f="$1/.git/hooks/post-commit"
  mkdir -p "$dir"
  if [ -f "$f" ] && grep -q "$HOOK_MARK" "$f"; then
    python3 - "$f" "$HOOK_MARK" "$2" <<'PY'
import sys,re
f,mark,body=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(f).read()
s=re.sub(re.escape(mark)+r" begin.*?"+re.escape(mark)+r" end\n", body, s, flags=re.S)
open(f,"w").write(s)
PY
  elif [ -f "$f" ]; then printf '\n%s' "$2" >> "$f"
  else printf '#!/usr/bin/env bash\n%s' "$2" > "$f"; fi
  chmod +x "$f"
}
cmd_hooks() {
  local sync="$UP/sync.sh"
  install_hook "$UP" "$HOOK_MARK begin
# After a commit in the toolbar repo, bring every host up to date (local only).
[ -n \"\${PROTO_SYNC:-}\" ] && exit 0
PROTO_SYNC_QUIET=1 \"$sync\" out || true
$HOOK_MARK end
"
  say "  upstream: post-commit hook → sync.sh out"
  local n
  for n in $(names); do
    local p; p="$(hpath "$n")"
    [ -d "$p/.git" ] || { say "  $n: no clone at $p — skipped"; continue; }
    install_hook "$p" "$HOOK_MARK begin
# After a commit that touched toolbar/, harvest it upstream and fan it out to
# the other prototypes (local only; nothing is pushed).
[ -n \"\${PROTO_SYNC:-}\" ] && exit 0
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q '^toolbar/'; then
  PROTO_SYNC_QUIET=1 \"$sync\" in $n || true
  PROTO_SYNC_QUIET=1 \"$sync\" out --except $n || true
fi
$HOOK_MARK end
"
    say "  $n: post-commit hook → sync.sh in $n + out"
  done
}

# ---- push --------------------------------------------------------------------------
cmd_push() {
  say "upstream: $(git -C "$UP" push 2>&1 | tail -1)"
  local n
  for n in $(names); do
    local p; p="$(hpath "$n")"; [ -d "$p/.git" ] || continue
    say "$n: $(git -C "$p" push 2>&1 | tail -1)"
  done
}

case "${1:-status}" in
  status) cmd_status ;;
  in)     shift; cmd_in "$@" ;;
  out)    shift; cmd_out "$@" ;;
  mirror) shift; cmd_mirror "$@" ;;
  watch)  cmd_watch ;;
  hooks)  cmd_hooks ;;
  push)   cmd_push ;;
  -h|--help|help) sed -n '2,30p' "$0" ;;
  *) echo "sync.sh: unknown command '$1' (status | in | out | mirror | watch | hooks | push)" >&2; exit 2 ;;
esac
