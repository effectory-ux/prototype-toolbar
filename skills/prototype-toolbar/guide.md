# Prototype toolbar — the guide

This is the live part of the skill, fetched from the repo by `toolbar-skill.sh sync`;
editing it is a commit in github.com/effectory-ux/prototype-toolbar, no re-upload.
The config contract (every field of `window.PROTO_TOOLBAR` and of the React
props) is in the toolbar README the sync put next to this guide:
`.ds-cache/prototype-toolbar/README.md` (in a React host also
`node_modules/prototype-toolbar/README.md`). The prototype's own
`toolbar/README.md` is only a pointer.

## Where the flag goes

`?prototype-toolbar` is a query parameter: it goes **after the page and before
any `#`**, which is also the form the bar produces and shares. On a page
without a hash route that is simply the end of the link. Other forms (after the
`#`, in front of another parameter, a stray second `?`) are accepted and
rewritten on arrival, so tell colleagues the one rule and let the bar tidy the
rest. Never hand out a pre-v2 `?<key>-toolbar-active` link; those are dead.

## Which situation you are in

Look at the folder before doing anything:

- `toolbar.sh` and `prototype-bar.js` next to each other → this is the
  toolbar's own repo. Skip to "Improving the toolbar itself" at the bottom;
  never adopt here.
- `proto-config.js` → a wired static prototype.
- `prototype-toolbar` in a `package.json` → a wired React prototype.
- None of those → a prototype that does not have the toolbar yet. Ask once
  before wiring it (see "When to wire it, and when not").

## Two flavors, one bar

- **Static** prototype (Engage design-system HTML pages, no build): a vendored
  `toolbar/` folder loaded by `toolbar/load.js`, configured by a `proto-config.js`.
- **React/Vite** prototype (CYOS): the npm package `prototype-toolbar`, configured
  by a `src/data/proto-config.js` module.

Which one a prototype is decides the recipe below. A prototype that has neither
does not have the toolbar yet: ask once before wiring it.

## Wiring a static prototype

From the prototype's root (the folder its pages are served from):

```bash
bash "<skill folder>/toolbar-skill.sh" adopt <slug>     # e.g. adopt gl
```

It creates `toolbar/` from the published release line, writes `proto-config.js`
with empty lists (or keeps an existing one), puts the two tags
on **every page that lacks them, the index included**, right after `<body>`
opens, and prints the prototype's links. Safe to run again. What it adds:

```html
<script src="proto-config.js"></script>
<script src="toolbar/load.js"></script>
```

Pages in a subfolder get `../` prefixes unless they carry a `<base>`. A
redirect-only index keeps its two tags and redirects *after* them, honouring
the start a colleague chose and carrying the flag; the script rewrites a
`<meta http-equiv="refresh">` into:

```html
<script>location.replace(ProtoToolbar.carry(ProtoToolbar.startPath() || "overview.html"));</script>
```

Check the output: a page without a `<body>` tag is listed for wiring by hand.
Later, for new pages: `bash toolbar/adopt.sh inject` (or `toolbar-skill.sh
inject`). For the links at any time: `bash toolbar/adopt.sh link [page]` (or
`toolbar-skill.sh link [page]`) — the colleague link and the tester link, for
localhost (serve.py, port 3000) and for the live site. A colleague
without this skill gets the same from the release line, in the prototype root:

```bash
curl -fsSL https://effectory-ux.github.io/prototype-toolbar/v2/adopt.sh | bash -s -- <slug>   # wire
curl -fsSL https://effectory-ux.github.io/prototype-toolbar/v2/adopt.sh | bash -s -- link     # links
```

Then fill `proto-config.js`: the prototype's real `name`, `live` (its Pages
URL), and `screens`, `versions`, `edgeCases`, `variants` as the prototype has
them. A screen is `{ key, label, desc, href }` — `href` a filename relative to
the page, or a function of the current URL; mark the default start with
`default: true`. A dialog or sub-state is a screen too: give it a deep-link
`href` (`overview.html?open=review`) and a `match` that checks the query, and
let the page open the dialog when it sees the parameter.

**Several prototypes in one repo** (a docs repo with many pages at the root):
one shared `toolbar/`, but one config per prototype — `proto-config-<slug>.js`
with its own `prefix`, `name`, `live` and `screens` — and each prototype's
pages include their own config file before `toolbar/load.js`. `live` stays the
**site** root (the repo's Pages address) in every one of them: Share appends
the page you are on, so it never links to a neighbour's index. Only set `start`
if that prototype has a fixed front door worth offering.

Look at it locally: serve the root (the project's `serve.py`, or
`python3 -m http.server 3000`) and open any page with `?prototype-toolbar`. Without the flag the page must show nothing of the toolbar.

## Wiring a React/Vite prototype

```bash
npm install github:effectory-ux/prototype-toolbar#semver:^1.0.0
```

- `src/data/proto-config.js` exports `PROTO_STORAGE_PREFIX`, `USE_CASES`,
  `EDGE_CASES`, `VARIANTS`. Hand the module over whole:
  `import * as PROTO from "./data/proto-config.js"` and
  `<PrototypeBar config={PROTO} onUseCase={goto} edges={edges} onToggleEdge={toggle} />`
  inside `<div className="proto-shell">…</div>`. Handlers stay props: they are
  app state.
- `vite.config.js`: add `protoEdits()` from
  `prototype-toolbar/vite-plugin-proto-edits.js` to the plugins. With more
  than one version also `protoVersions(VERSIONS)` and `versions={VERSIONS}`,
  where `VERSIONS` is a `prototype-versions.js` registry at the repo root:
  `[{ key, label, desc, port, path, url }]` (README → Versions).
  One version: skip both.
- Start is a Screens row (the first `USE_CASES` entry is the default). The
  older `START_POINTS`/`getStartAt` pair only matters for a host without
  `USE_CASES`.

CYOS is the reference: `phase-2/src/app.jsx` and `phase-2/vite.config.js` in
https://github.com/effectory-ux/cyos.

## Keeping the toolbar truthful — the rules that make it useful

These rules apply where the toolbar is wired (a `proto-config.js` or a
`PrototypeBar` import exists).

1. **Screens the bar learns by itself.** While a prototype runs, every route it
   shows is recorded. Screens no entry leads to appear under Screens as
   **"Seen here, not in this list"** (amber count on a dev host).
   - React: the dev server writes the map to `public/proto-discovered.json`
     (commit it); `node node_modules/prototype-toolbar/check.js <package-dir>`
     prints the unregistered screens and exits 1 when there are any. Run it
     before committing UI work. Registering a `USE_CASES` entry alone does not
     clear an item: open the new entry once from the Screens menu on the dev
     server so the bar learns which route it leads to, then commit the
     rewritten `proto-discovered.json`.
   - Static: the map lives in the browser only. Open the Screens menu on a dev
     host and register what "Seen here" shows as `screens` entries; there is
     no file and no check command.
   Either way, decide per item: register it, or it is not a screen.
2. **Edge cases, variants and start screens only exist in the conversation.**
   When a prompt introduces an account difference ("what if there are no
   teams"), a design variation ("show the compact version too") or an entry
   point ("open on the questionnaire"), register it in the prototype's config
   in the same change: an edge case as an `edgeCases`/`EDGE_CASES` entry, a
   variation as a `variants`/`VARIANTS` entry, an entry point as a screen
   (with `default: true` if it is the new default). A state that exists in
   the app but not in the toolbar is a bug.
3. **Never edit files in `toolbar/` or `node_modules/prototype-toolbar`.** They
   are copies; the next update overwrites them. Change the toolbar in its own
   repo and release it (below).
4. **Copy is UX copy.** Labels and descriptions in the config are read by
   colleagues: short, specific, no jargon. Apply the ux-copy skill when it is
   available.
5. **The page's own navigation keeps the flag.** The bar carries it on the
   page's `<a>` links; for `location.href` or `location.replace` use
   `ProtoToolbar.carry(url)`. The API exists on every page, tester pages
   included, so no `if` is needed.

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
`./toolbar.sh release patch|minor|major` does. Ask before releasing. Tell the
toolbar maintainer about a newly wired prototype so it is listed in the repo's
`hosts.json` (used only by the maintainer's status command; nothing in the
prototype depends on it).
