# Prototype toolbar — working notes for agents

This repo is the **single source** of the prototype toolbar every Effectory UX
prototype shares. It is **published, not copied**: static prototypes load the
runtime from this repo's GitHub Pages site (release line `v1/`) through a small
vendored `toolbar/load.js`; React/Vite prototypes (CYOS) install this repo as
an npm dependency pinned to `#semver:^1.0.0`. Two flavors ship from the same
files — `PrototypeBar.jsx` (React) and `prototype-bar.js` (vanilla) — sharing
`prototype-bar.css` and the link contract in README.md. Keep both flavors in
step when you change behaviour or copy.

## Rules

- Nothing in here may know about any one prototype. Host-specific things
  (keys, screens, versions, edge cases) live in each host's own config file.
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
- Tests: `node --check prototype-bar.js load.js`, `bash build-site.sh /tmp/x`,
  then look at one static host and CYOS phase-2 with the bar.
