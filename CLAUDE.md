# Prototype toolbar — working notes for agents

This repo is the **single source** of the prototype toolbar. Every prototype
that uses it embeds this whole repo as a git subtree at `toolbar/`; the list
of those hosts is `hosts.json`. Two flavors ship from the same files:
`PrototypeBar.jsx` for React/Vite prototypes (CYOS) and `prototype-bar.js` for
static HTML prototypes (question-library, gtma, group-linking,
results-dashboard). They share `prototype-bar.css` and the link contract in
README.md. Keep both flavors in step when you change behaviour or copy.

## Rules

- Nothing in here may know about any one prototype. Host-specific things
  (keys, screens, versions) live in the host's own config file.
- Commit here as usual. The post-commit hook (installed by `./sync.sh hooks`)
  then runs `./sync.sh out`, which pulls the new commit into every local host
  clone as a subtree commit. Nothing is pushed to GitHub by the hooks.
- To try an uncommitted edit inside a real prototype: `./sync.sh mirror` (or
  `./sync.sh watch` while iterating), then open that prototype's dev server.
- Before starting work here, run `./sync.sh status`. If a host is AHEAD
  (someone edited `toolbar/` inside it), run `./sync.sh in <host>` first so
  you build on the latest toolbar.
- `./sync.sh push` pushes upstream and every host to GitHub. Ask before
  running it unless the user already said to publish — it deploys the
  static hosts' Pages sites.
- Tests: there is no build. Check `node --check prototype-bar.js`, then open a
  static host (e.g. gtma) locally and a React host (CYOS phase-2 via
  `npm --prefix phase-2 run dev`) and look at both bars.
