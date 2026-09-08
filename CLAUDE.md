# Prototype toolbar — working notes for agents

This repo is the **single source** of the prototype toolbar every Effectory UX
prototype shares. It is **published, not copied**: static prototypes load the
runtime from this repo's GitHub Pages site (release line `v1/`) through a small
vendored `toolbar/load.js`; React/Vite prototypes (CYOS) install this repo as
an npm dependency pinned to `#semver:^1.0.0`. Two flavors ship from the same
files — `PrototypeBar.jsx` (React) and `prototype-bar.js` (vanilla) — sharing
`prototype-bar.css` and the link contract in README.md. Keep both flavors in
step when you change behaviour or copy.

The repo is also a Claude Code **plugin** and an Organization Skill
(`skills/prototype-toolbar/`, `.claude-plugin/` holds the manifest and a
self-pointing marketplace). The skill fetches its own content live, like the
design-system skill: `SKILL.md` is a thin shell and `toolbar-skill.sh sync`
pulls `guide.md`, `scripts/adopt.sh` and this repo's README from `main` into
the project's `.ds-cache/prototype-toolbar/`. So: **wiring or rule changes go
in `guide.md`** (a commit is enough); change `SKILL.md` or `toolbar-skill.sh`
only when unavoidable, because that needs a re-upload (`./toolbar.sh skill`
builds the zip and sync tells users their bundle is behind). The team's channel
is the Organization Skill upload, one per skill and no second copy: the plugin
install is only for terminal users, because two copies of a skill both answer
the same request.

## Rules

- Nothing in here may know about any one prototype. Host-specific things
  (screens, versions, edge cases) live in each host's own config file. The
  toolbar flag is the same everywhere: `?prototype-toolbar`.
- **Commits to main change nothing for any prototype.** Only a release does:
  `./toolbar.sh release patch|minor|major` (semver — major = a host must
  change something). Ask before releasing unless the user already said to.
- To see an edit in a real prototype before releasing: `./toolbar.sh serve`,
  then open the prototype once with `?proto-toolbar-src=http://localhost:8790/`.
  For CYOS: `PROTO_TOOLBAR_DEV=$PWD npm --prefix ../Projects/CYOS/phase-2 run dev`.
- `./toolbar.sh status` shows which version every host has; hosts are in
  `hosts.json`. Static hosts refresh their vendored copy with `toolbar/update.sh`,
  CYOS with `npm update prototype-toolbar` (per phase).
- Never push to a host repo from here. `release` pushes only this repo.
- Tests: `node --check prototype-bar.js load.js discover.js check.js`, `bash build-site.sh /tmp/x`,
  then look at one static host and CYOS phase-2 with the bar.
