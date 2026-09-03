#!/usr/bin/env bash
# build-site.sh <outdir> — assemble the GitHub Pages site for the toolbar:
#
#   /                      the tip of main ("latest"; may be ahead of any release)
#   /v1.2.3/               every release, immutable, from its git tag
#   /v1/                   every release LINE: the newest release with that major
#                          (what load.js and update.sh follow)
#   /index.html            a plain list of the above
#
# Each folder carries version.json {version, tag, commit, date}. The published
# files are the runtime set only — no repo tooling.
set -euo pipefail
OUT="${1:-dist}"; rm -rf "$OUT"; mkdir -p "$OUT"
FILES="load.js prototype-bar.js prototype-bar.css update.sh"
emit() { # <ref> <dir> <version-label> <tag-or-empty>
  local ref="$1" dir="$2" ver="$3" tag="$4"
  mkdir -p "$dir"
  git archive "$ref" $FILES VENDORED.md | tar -x -C "$dir"
  mv "$dir/VENDORED.md" "$dir/README.md"
  printf '{ "version": "%s", "tag": "%s", "commit": "%s", "date": "%s" }\n' \
    "$ver" "$tag" "$(git rev-parse --short "$ref")" "$(git log -1 --format=%cI "$ref")" > "$dir/version.json"
}
pkgver() { git show "$1:package.json" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1; }

emit HEAD "$OUT" "$(pkgver HEAD)" ""
rows=""; lines=""; majors=""
for tag in $(git tag -l 'v[0-9]*' --sort=v:refname); do
  ver="${tag#v}"; emit "$tag" "$OUT/$tag" "$ver" "$tag"
  rows="$rows<li><a href=\"$tag/\">$tag</a></li>"
  case " $majors " in *" ${ver%%.*} "*) ;; *) majors="$majors ${ver%%.*}" ;; esac
done
for major in $majors; do
  tag="$(git tag -l "v$major.*" --sort=v:refname | tail -1)"
  emit "$tag" "$OUT/v$major" "${tag#v}" "$tag"
  lines="$lines<li><a href=\"v$major/\">v$major/</a> → $tag</li>"
done
touch "$OUT/.nojekyll"
cat > "$OUT/index.html" <<HTML
<!doctype html><meta charset="utf-8"><title>Prototype toolbar</title>
<style>body{font:14px/1.6 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 24px;color:#222}code{background:#f2f2f2;padding:1px 4px;border-radius:3px}</style>
<h1>Prototype toolbar</h1>
<p>The toolbar Effectory UX prototypes share. Source and docs: <a href="https://github.com/effectory-ux/prototype-toolbar">github.com/effectory-ux/prototype-toolbar</a>.</p>
<h2>Release lines (what prototypes follow)</h2><ul>${lines:-<li>No release yet</li>}</ul>
<h2>Releases</h2><ul>${rows:-<li>No release yet</li>}</ul>
<h2>Latest (tip of main)</h2><ul><li><a href="prototype-bar.js">prototype-bar.js</a>, <a href="prototype-bar.css">prototype-bar.css</a>, <a href="load.js">load.js</a>, <a href="version.json">version.json</a></li></ul>
<p>Include in a static prototype: <code>&lt;script src="toolbar/load.js"&gt;&lt;/script&gt;</code> with a vendored <code>toolbar/</code> from a release line (see the repo README).</p>
HTML
echo "site built in $OUT: $(ls "$OUT" | tr '\n' ' ')"
