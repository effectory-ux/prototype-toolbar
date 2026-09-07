# Prototype toolbar — the guide

This is the live part of the skill, fetched from the repo by `toolbar-skill.sh sync`;
editing it is a commit in github.com/effectory-ux/prototype-toolbar, no re-upload.

**When to wire it, and when not.** The toolbar belongs in prototypes that get
reviewed and tested — where colleagues jump between states, flip edge cases and
hand out tester links. A demo with one story to tell (a marketing before/after,
a research artefact) does not need it: don't wire it by reflex, ask when in
doubt. Once wired, the tester link never shows it, so it costs nothing.

One toolbar, shared by every Effectory UX prototype, **published, not copied**:
source and docs at https://github.com/effectory-ux/prototype-toolbar, runtime on
https://effectory-ux.github.io/prototype-toolbar/v1/ (release line 1, semver).
For the full config contract, read the README the sync put next to this guide
(`README.md` in the cache) — or the prototype's own vendored `toolbar/README.md`.

## The link contract (never break it)

- A prototype mints **one key** (an opaque id like `gl-9k4p`), once, in its config.
- **Colleague link** = the URL with `?<key>-toolbar-active` → the bar shows.
- **Tester link** = the same URL without it → nothing of the toolbar is even
  requested. Localhost included: a keyed prototype shows the bar only with the flag.
- Every navigation the bar performs carries the flag; Share strips it.

## Wiring a static prototype (Engage design-system HTML)

Run, in the prototype's root:

```bash
./toolbar-skill.sh adopt <slug>      # e.g. adopt gl — runs the freshest adopt.sh
```

It creates `toolbar/` from the published release line, writes a `proto-config.js`
with a fresh key and empty lists, and prints the two tags. Then, on every
screen page (not on redirect-only index pages), right after `<body>` opens:

```html
<script src="proto-config.js"></script>
<script src="toolbar/load.js"></script>
```

Fill `proto-config.js`: `name`, `live` (the Pages URL), and `screens`,
`versions`, `edgeCases`, `variants` as the prototype has them (shape in the
README). Pages in a subfolder use `../toolbar/…` paths, or a `<base>`.

## Wiring a React/Vite prototype

```bash
npm install github:effectory-ux/prototype-toolbar#semver:^1.0.0
```

Import `PrototypeBar` and `getStartAt` from `prototype-toolbar/PrototypeBar.jsx`,
add `protoEdits()` and `protoVersions(VERSIONS)` from the two
`prototype-toolbar/vite-plugin-*.js` files to the Vite plugins, wrap the app in
`<div className="proto-shell">`, and keep the prototype's own settings in a
`proto-config.js` (`PROTO_TOOLBAR_KEY`, `USE_CASES`, `START_POINTS`,
`EDGE_CASES`, `VARIANTS`). CYOS is the reference: `phase-2/src/app.jsx` and
`phase-2/vite.config.js` in https://github.com/effectory-ux/cyos.

## Keeping the toolbar truthful — the rules that make it useful

1. **Screens the bar learns by itself.** While a prototype runs, every route it
   shows is recorded; on a Vite dev server into `public/proto-discovered.json`
   (commit it). Screens no entry leads to appear under Screens as "seen here,
   not in this list" and in `node node_modules/prototype-toolbar/check.js <dir>`.
   Before committing UI work: run the check, then register each listed screen
   (a `USE_CASES` entry with its state setup, or a `screens` entry) or decide it
   is not a screen.
2. **Edge cases, variants and start points only exist in the conversation.**
   When a prompt introduces an account difference ("what if there are no
   teams"), a design variation ("show the compact version too") or an entry
   point ("open on the questionnaire"), register it in the prototype's config
   in the same change. A state that exists in the app but not in the toolbar
   is a bug.
3. **Never edit files in `toolbar/` or `node_modules/prototype-toolbar`.** They
   are copies; the next update overwrites them. Change the toolbar in its own
   repo and release it (below).
4. **Copy is UX copy.** Labels and descriptions in the config are read by
   colleagues: short, specific, no jargon. Apply the ux-copy skill.

## Updating a prototype's copy

- Static: the bar shows an amber **Update** when the vendored copy is behind →
  `toolbar/update.sh`, commit. Deployed prototypes already run the newest
  release regardless (the vendored copy is only their fallback).
- React: `npm update prototype-toolbar` per package, commit the lock file.

## Improving the toolbar itself

Clone https://github.com/effectory-ux/prototype-toolbar (its CLAUDE.md has the
rules). `./toolbar.sh serve`, then open any prototype once with
`?proto-toolbar-src=http://localhost:8790/` to run the bar from the working
tree (`=off` to stop). React: start the app with
`PROTO_TOOLBAR_DEV=<clone>`. Keep both flavors in step (`PrototypeBar.jsx` and
`prototype-bar.js`). Commits change nothing for anyone; only
`./toolbar.sh release patch|minor|major` does. Ask before releasing.
