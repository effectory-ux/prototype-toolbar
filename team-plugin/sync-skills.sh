#!/usr/bin/env bash
# sync-skills.sh [name…] — assemble the team plugin from the skills' own repos.
#
# Each Effectory UX skill keeps living in its own repo; this copies each one's
# skill folder into skills/<name>/ here, so this repo is a single installable
# plugin ("effectory-ux") whose skills are addressed /effectory-ux:<name>.
# Run it, look at the diff, commit. Private repos use your own git credentials
# (gh auth login or an SSH key).
#
# With no arguments it syncs every skill in skills.json that is not `pending`.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REG="$HERE/skills.json"
command -v jq >/dev/null || { echo "sync-skills.sh: needs jq" >&2; exit 1; }
want=("$@")
wanted() { [ ${#want[@]} -eq 0 ] && return 0; local n; for n in "${want[@]}"; do [ "$n" = "$1" ] && return 0; done; return 1; }

count=0
while IFS=$'\t' read -r name repo path ref pending; do
  wanted "$name" || continue
  if [ "$pending" = "true" ] && [ ${#want[@]} -eq 0 ]; then
    echo "  · $name — skipped (pending: see its note in skills.json)"; continue
  fi
  tmp="$(mktemp -d)"
  # blobless + sparse: only the skill folder's files are downloaded.
  # </dev/null so git cannot eat the loop's input. Two calls rather than an
  # array of optional args: macOS still ships bash 3.2, where "${a[@]}" on an
  # empty array trips `set -u`.
  url="https://github.com/$repo.git"
  if [ "$ref" != "-" ] && [ -n "$ref" ]; then
    git clone -q --depth 1 --filter=blob:none --sparse --branch "$ref" "$url" "$tmp" </dev/null 2>/dev/null || ok=0
  else
    git clone -q --depth 1 --filter=blob:none --sparse "$url" "$tmp" </dev/null 2>/dev/null || ok=0
  fi
  if [ "${ok:-1}" = 0 ]; then
    echo "  ✗ $name — cannot clone $repo (private? run: gh auth login)"; rm -rf "$tmp"; ok=1; continue
  fi
  git -C "$tmp" sparse-checkout set "$path" >/dev/null 2>&1 || true
  if [ ! -d "$tmp/$path" ]; then
    echo "  ✗ $name — $repo has no $path (check skills.json)"; rm -rf "$tmp"; continue
  fi
  rm -rf "$HERE/../skills/$name"; mkdir -p "$HERE/../skills"
  cp -R "$tmp/$path" "$HERE/../skills/$name"
  rm -rf "$HERE/../skills/$name/.git"
  echo "  ✓ $name ← $repo/$path ($(git -C "$tmp" rev-parse --short HEAD))"
  rm -rf "$tmp"; count=$((count + 1))
  # "-" for an absent ref: with IFS=tab an EMPTY field would collapse and shift
  # every field after it (tab is IFS whitespace), which once sent `--branch false`
done < <(jq -r '.skills[] | [.name, .repo, .path, (.ref // "-"), (.pending // false | tostring)] | @tsv' "$REG")
echo "synced $count skill(s) into skills/ — check the diff, then commit"
