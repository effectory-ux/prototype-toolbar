# Prototype toolbar

A self-contained toolbar for prototypes, in the spirit of the Figma /
Claude Design prototype chrome. It comes in two flavors from the same repo —
`PrototypeBar.jsx` for React/Vite prototypes (an npm dependency) and
`prototype-bar.js` for static HTML pages (loaded from GitHub Pages, see "Static
prototypes" below) — sharing one stylesheet and one link contract: a dark, compact row **above** the prototype
(never an overlay) with four menus — jump to a **use case**, flip **edge
cases**, compare **variants**, choose the **start point** — plus an **Events**
mode (the Piwik analytics spec drawn over the live UI) and the current deep
link with a copy button. Hide it with Ctrl+` or the close button; a peek tab
on the right screen edge brings it back.

This repo knows nothing about any one prototype: in CYOS it is the single
toolbar every phase imports (phase-2 does so from `phase-2/src/app.jsx` and
`phase-2/vite.config.js`). Everything
project-specific — use cases, start points, variants, the toolbar key, the
Piwik event registry — comes in as props from the host's own config (in CYOS:
`phase-2/src/data/proto-config.js` and `phase-2/src/data/piwik-events.js`).
Change this folder and every consumer gets it; nothing in here may import
from a host app.

## Who sees it

- **Prototyping** (localhost, `127.0.0.1`, a `.local` or LAN host): the toolbar
  is there by default. No flag to remember while you work.
- **Anywhere else** (the deployed prototype): only for a URL carrying
  `?<toolbarKey>-toolbar-active`, where `toolbarKey` is an id the host mints once
  and passes in as a prop. Every other link — the one a tester or participant is
  handed — is the plain prototype: no toolbar, no peek tab, no shortcut.

There is no "off" switch: the URL without the flag is already the version
without the toolbar.

The two copy buttons differ by who you are copying for: the **link** icon takes
this step exactly as you see it (flag and all — that is how a colleague gets the
toolbar), **Share** takes the same step with the toolbar stripped out. Rotating
the key in the host's config invalidates every toolbar link handed out so far.

Inline copy editing is dev-only by an explicit host check, not by a failed
request: a deployed prototype never shows the Edit button.

## The link contract — every toolbar, every port

The gating above is not a feature of this React bar; it is the contract for ANY
prototype that carries a toolbar, including ports of this bar to other stacks
(e.g. the vanilla-JS port in `question-library-v3`). One prototype must always
yield two kinds of links without deploying anything twice:

- **Colleague link** — the current URL *with* `?<toolbarKey>-toolbar-active`:
  whoever opens it gets the toolbar (designers, PMs, developers walking the
  states).
- **Tester link** — the same URL *without* the flag: the plain prototype. No
  toolbar, no peek tab, no keyboard shortcut, no rendered-then-hidden DOM — a
  participant can never stumble into the tooling.

Rules a port must keep:

1. **Dev hosts** (`localhost`, `127.0.0.1`, `*.local`, LAN IPs) always show the
   bar, no flag needed — nothing to remember while building.
2. **Anywhere else** the bar exists only when the URL carries the flag. The
   check gates *rendering*, not visibility: without the flag, none of the bar's
   DOM, listeners, or shortcuts may be installed.
3. **Mint the key once per prototype** (an opaque id like `ql-3a7k`), never
   reuse one across prototypes. Rotating the key invalidates every toolbar
   link handed out so far — that is the kill switch, so there is no other
   off switch.
4. **Carry the flag along**: every navigation the toolbar itself performs
   (version switch, screen jump, edge-case reload) must preserve the query
   string, so the bar doesn't vanish mid-walkthrough on a multi-page
   prototype.
5. **Share strips the flag**: the share/copy affordance produces the tester
   link (URL minus flag) — handing out a clean link must never require
   editing a URL by hand.

The reference implementation of the check:

```js
const FLAG = `${TOOLBAR_KEY}-toolbar-active`;
const isDevHost = () =>
  ["localhost", "127.0.0.1"].includes(location.hostname) ||
  /\.local$/.test(location.hostname) || /^192\.168\./.test(location.hostname);
const barActive = () =>
  isDevHost() || new URLSearchParams(location.search).has(FLAG);
if (!barActive()) return; // render nothing at all
```

## What lives here

- `PrototypeBar.jsx` — the component. No imports from the host app.
- `EventLayer.jsx` — the Piwik event spec layer (below).
- `prototype-bar.css` — all its styles, imported by the component. Includes
  `.proto-shell`, the wrapper the host puts around its whole app.
- `icons.jsx` — the glyphs it uses, inlined.
- `copyEdit.js` + `vite-plugin-proto-edits.js` — inline copy editing (below).

## Piwik events (EventLayer)

In Figma the analytics spec lived in comments ("PIWIK event / Category: … /
Action: …") for a developer to pick up. Here the host passes a registry of
event definitions (`events` prop) and marks the triggering elements with
`data-piwik="<key>"`; the toolbar's **Events** toggle then draws the spec on
the working UI:

- a **pin** on every tracked element — dot for a plain event, green play
  triangle for a funnel start, amber square for a funnel end;
- a **popover** per pin with the definition in the exact Figma-comment format
  and a "Copy for developers" button;
- a **fired-events log** (bottom right) that records every tracked interaction
  live — `on: "click"` events when clicked, `on: "view"` events when their
  element appears — and announces when a funnel completes.

A definition: `{ label, category, action, on: "click"|"view",
funnel?: { id, role: "start"|"end" } }`. Several events may share a funnel
start (any of them begins the task); ending on a `view` event lets a funnel
end on the outcome, whichever path led there. The `funnels` prop maps funnel
ids to `{ label, desc }`.

## Inline copy editing

The **Edit** button (dev server only) makes the whole prototype
contentEditable and freezes its interactions, so any text can be clicked and
retyped — open the state you want to edit first (the Use cases menu exists for
exactly that). Editing is TEXT-ONLY by construction: the selection is clamped
to a single text node (you can't select across elements or grab an icon or
button as an object) and every edit is applied by the tool itself to the text
node's value — the browser never mutates the DOM, so elements can't be
deleted, split or merged. Enter, drops, formatting and rich paste are inert. Every keystroke is saved **in real time**: a debounced POST to
the Vite dev server writes `public/proto-edits.json` in the repo, each entry
carrying the element path, the new text and the original.

The same file is fetched at boot and re-applied after every React render, so
edits survive menus, dialogs, navigation and reloads. Committed, it ships with
the build — the deployed prototype shows the edited wording read-only (no Edit
button there). Edit mode has its own undo/redo (Ctrl+Z / Ctrl+Shift+Z — the
browser's native undo is disabled because it can't know about manual edits)
and a trash button that deletes all text changes.

Linking between renders of the same string is EXPLICIT, via text-asset ids:
the host app marks elements with `data-t` (an opaque id — a number for static
entities, a model-derived token like `q-<id>` for dynamic ones; never the
text's own value). Every element sharing the edited entry's id follows the
edit; the same characters under different ids stay independent — e.g. the
coordinator-facing survey name and a participant title that defaults to it.
Form fields carrying the id are synced once per mount through React's own
value setter, so the host state updates and the dialog's save flow owns the
commit. Same-ish templates ("1 question" / "2 questions") are a future
iteration — don't tag those yet.

Because each entry keeps `orig` next to `text`, the file doubles as a work
order: an agent can fold the new wording into the actual source strings and
empty the file — edits become the new base instead of a patch layer.

Hosting it in another project: add `protoEdits()` from
`vite-plugin-proto-edits.js` to the Vite plugins array. Everything else is
wired inside `PrototypeBar`.

## Static prototypes: `prototype-bar.js`

Most Engage design-system prototypes are plain HTML pages with no build step
(gtma, group-linking, results-dashboard, question-library). For those the same
bar ships as dependency-free vanilla JS, **published on GitHub Pages** —
`https://effectory-ux.github.io/prototype-toolbar/v1/` — the way the design
system itself is consumed. A page includes ONE local file, the loader, plus its
own config; the loader brings in the stylesheet and the bar:

```html
<body>
  <script src="proto-config.js"></script>      <!-- the host's own -->
  <script src="toolbar/load.js"></script>      <!-- right after <body> opens: no pop-in -->
  …
```

`toolbar/` in the host is a **vendored copy** of the runtime files (`load.js`,
`prototype-bar.js`, `prototype-bar.css`, `update.sh`, `version.json`) taken
from a release line — the CDN-with-local-fallback pattern:

- **Deployed**, the loader takes the published release line first, so a
  toolbar release reaches every prototype with no commit in it; the vendored
  copy is the fallback if that fails to load.
- **On localhost** it takes the vendored copy first (instant, works offline).
- The bar checks the published `version.json` and shows an **Update** hint
  when the vendored copy is behind; `toolbar/update.sh` refreshes it (commit
  the result). `toolbar/update.sh 2` moves a host to a new release line.
- **Working on the toolbar itself:** `./toolbar.sh serve` in this clone, then
  open any prototype once with `?proto-toolbar-src=http://localhost:8790/`.
  That prototype now loads the bar from your working tree until you open it
  with `?proto-toolbar-src=off`. Or `./toolbar.sh vendor <host>` to copy the
  working tree into a host's `toolbar/` for a real deployed try-out.
- Without the toolbar flag on a non-dev host the loader loads nothing: a
  tester's page never even requests the toolbar.

Adopting it in a new static prototype: create `toolbar/`, run
`curl -fsSL https://effectory-ux.github.io/prototype-toolbar/v1/update.sh | bash -s`
inside it (or copy the files from another host and run `toolbar/update.sh`),
add the two tags to every screen page, write `proto-config.js`, add the host
to `hosts.json` here.

`proto-config.js` defines `window.PROTO_TOOLBAR`. Every field is optional; a
menu with no entries is not rendered. Functions receive the current `URL` and
return the target (a filename relative to the page is fine):

```js
window.PROTO_TOOLBAR = {
  key: "gtma-7c2m",                // the ?<key>-toolbar-active gate (mint one per prototype)
  prefix: "gtma",                  // localStorage namespace
  name: "GTMA",                    // badge text when the page is in no version
  live: "https://effectory-ux.github.io/gtma/",   // powers the Share menu
  versions: [{ key, label, desc, match: /-before-/, go: u => "…-before-….html" }],
  screens:  [{ key, label, desc, href: u => "….html", group: "Results dashboard" }],
  situations:[{ key, label, desc, on: false }],      // "Use cases" menu: persisted toggles, like edge cases
  edgeCases:[{ key, label, desc, on: false }],       // listed under "Edge cases" in that same menu
  variants: [{ key, label, desc, on: u => bool, href: (on, u) => "….html" }], // or persisted like edges
  startPoints: [{ key, label }],
  shell: true,                     // false: plain block above the page instead of a body column
};
```

`match` decides which version the page belongs to (string = pathname
contains, RegExp, or function); `go` is the same screen in that version.
`screens[].href` marks the current one by comparing pathnames (or give it its
own `match`). A URL-based variant (`on` + `href`) navigates; a variant without
`href` is persisted and the page reads it back. The page reads its settings
through `window.ProtoToolbar`: `edge(key)`, `variant(key)`, `startAt(fallback)`,
`plainLink()`, `carry(href)` — the API exists even when the bar is not rendered,
so page code needs no `if`. A page can refuse the body shell with
`<body data-proto-shell="off">`.

The shell: with the bar active, `<body>` becomes a column — bar on top, page
below at the remaining height — and the design-system `.app` (100vh) shrinks to
fit. Fixed layers of the page can offset themselves by `--proto-bar-h` (0 while
collapsed). Not available in this flavor, because they need a dev server:
inline copy editing, the Piwik event layer, dev-server auto-start.

## Dropping it into a React/Vite project

1. Install it from GitHub, pinned to the release line:
   `npm install github:effectory-ux/prototype-toolbar#semver:^1.0.0` — then
   import `prototype-toolbar/PrototypeBar.jsx` and the vite plugins from
   `prototype-toolbar/vite-plugin-proto-edits.js` and
   `prototype-toolbar/vite-plugin-proto-versions.js`. `npm update
   prototype-toolbar` moves to the newest release on that line. To work on
   the toolbar from inside the app, set `PROTO_TOOLBAR_DEV=/path/to/this/clone`
   when starting `vite dev`: the host's vite config aliases the package to
   that folder (see CYOS's `phase-2/vite.config.js`).
2. Wrap your app: `<div className="proto-shell"><PrototypeBar …/><YourApp/></div>`
3. Pass your own config (all optional — a menu with no entries isn't rendered):

```jsx
<PrototypeBar
  storagePrefix="myproto"                 // localStorage namespace
  toolbarKey="id-mykey"                   // the ?<key>-toolbar-active gate
  useCases={[{ key, label, desc }]}       // onUseCase(key) jumps there
  edgeCases={[{ key, label, desc, on }]}  // edges map + onToggleEdge(key)
  variants={[{ key, label, desc }]}       // varState map + onToggleVariant(key)
  startPoints={[{ key, label }]}          // remembered across sessions
  events={PIWIK_EVENTS} funnels={PIWIK_FUNNELS}  // the Events mode registry
  edges={edges} onUseCase={goto} onToggleEdge={toggle}
  varState={variantsOn} onToggleVariant={toggleVariant}
  versions={VERSIONS}
/>
```

Or hand over the whole config module and let the bar read it — declare a
setting in proto-config and its menu shows up, nothing else to wire:

```jsx
import * as PROTO from "./data/proto-config.js";

<PrototypeBar config={PROTO} versions={VERSIONS}
  onUseCase={goto} edges={edges} onToggleEdge={toggle} />
```

`config` understands the conventional export names (`USE_CASES`,
`EDGE_CASES`, `START_POINTS`, `VARIANTS`, `PIWIK_EVENTS`, `PIWIK_FUNNELS`,
`PROTO_STORAGE_PREFIX`, `PROTO_TOOLBAR_KEY`) and their camelCase twins;
explicit props win. Handlers (`onUseCase`, `edges`…) stay props — they are
app state, not config.

## What the toolbar learns

A config lists the screens someone registered; the prototype shows more than
that. So the bar watches the route while the prototype is used (`discover.js`)
and keeps a map of every distinct screen it has seen — ids folded, so
`/surveys/s3/…` and `/surveys/s7/…` are one screen — with how often, when, and
**which Screens entry led there** (learned when you pick one). Screens with no
entry leading to them appear in the Screens menu as **"Seen here, not in this
list"** (with an amber count on a dev host) and are printed by

```sh
node node_modules/prototype-toolbar/check.js phase-2   # exit 1 if any are unregistered
```

On a dev host the map is written to `public/proto-discovered.json` through the
dev server (the `protoEdits` vite plugin, no extra wiring), so it is committed
with the prototype and the deployed bar shows it too. Elsewhere it stays in the
browser. The static flavor does the same per page (`ProtoToolbar.seen()`).

**Start is a column of the Screens menu.** Every row in Screens — registered
screens, learned ones, legacy start points — has a radio in a **Start** column:
one at a time, the top row ("Default start") resets to the prototype's own
first page. The chosen start is remembered per prototype in the browser (path
plus query, so a dialog deep link like `?open=review` can be a start) and
applied before the app reads its first hash; static prototypes read it with
`ProtoToolbar.startPath()` in their index page. A separate Start menu only
appears for hosts without a Screens list. Dialogs and sub-pages count as
screens: register them with a deep-link `href` and a `match` that checks the
query, and let the page open the dialog when it sees the parameter.

**The rule for agents building a prototype:** the toolbar learns *screens* by
itself, but *edge cases, variants and start points* only exist in the
conversation. When a prompt introduces a state ("what if the account has no
teams"), a variation ("show the compact version too") or an entry point
("open on the questionnaire"), register it in the prototype's proto-config in
the same change — and before committing, run `check.js` and register or
dismiss what it lists.

## Share

The share icon opens a small menu with the LIVE address of the prototype,
built from the versions registry's `url`, so it is right even from localhost
and always points at the version you are on rather than at whatever was
deployed last. By default the link opens at the prototype's start and is
toolbar-free; "Share this page" makes it open on the screen you are looking
at, and "Include the toolbar" adds the key for receivers who should get the
bar. Without a registry `url` the menu falls back to copying the current
address without the flag.

## Versions: the badge names the prototype and switches between them

Pass `versions` — the host's registry of the prototype's versions, one entry
per version: `{ key, label, desc, port, path, toolbarKey }` (in CYOS the
registry is `prototype-versions.js` at the repo root; the toolbar folder
itself stays host-agnostic). The bar works out which entry is the page you
are on FROM THE URL — deployed path segment first, dev port as fallback — so
versions can share every source file with no per-version identity constant.

- The expanded bar's badge shows the version's name instead of "Toolbar"
  (the collapsed edge tab keeps saying "Toolbar") — the fastest way to tell
  near-identical versions apart.
- With more than one version, the badge becomes a menu linking each sibling
  to the same step (same hash route; the toolbar flag carried along on a
  deployed site).
- On a dev host, picking a sibling first asks this page's own dev server to
  start the sibling's server if it is down — that is the `protoVersions`
  vite plugin (`vite-plugin-proto-versions.js`); add it to every version's
  vite config with the same registry: `protoVersions(VERSIONS)`. Without the
  plugin the click just navigates.
- Deployed, the menu HEAD-checks each sibling and shows "Not published yet"
  instead of linking into a 404 — so the switcher stays in sync with what is
  actually on the Pages site, whatever the registry promises.

Without `versions` nothing changes: the badge reads "Toolbar" and there is
no menu.

4. At boot, read the chosen start point with
   `getStartAt(storagePrefix, fallbackKey)`.

## One toolbar, many prototypes: releases and versions

The toolbar is **published, not copied**. Its source is this repo; its
runtime is served from this repo's GitHub Pages site by `.github/workflows/pages.yml`
(`build-site.sh`), rebuilt on every push and every release tag:

| URL | What |
|---|---|
| `…/prototype-toolbar/v1/` | release line 1: the newest 1.x release — what hosts follow |
| `…/prototype-toolbar/v1.2.3/` | one release, immutable |
| `…/prototype-toolbar/` | the tip of main ("latest"), may be ahead of any release |

Versions are **semver** (`package.json` is the source of truth, stamped into
`prototype-bar.js` and `load.js` at release time): *patch* for a fix, *minor*
for a new feature or menu, *major* when a host has to change something — a
new config shape, a removed API, a different include. A major gets a new
release line (`v2/`) and hosts move over deliberately (`toolbar/update.sh 2`,
or `npm install …#semver:^2.0.0`); the old line keeps serving.

Cutting a release is one command: `./toolbar.sh release patch|minor|major`
(commits the bump, tags `vX.Y.Z`, pushes; Pages follows in a minute). A push
to main without a release only moves "latest"; no prototype is affected until
you release. So: iterate freely on main, release when it is right.

Keep everything host-specific OUT of this repo — keys, screens, versions,
edge cases live in each host's own config. Everything in here must stay
generic.

Maintainer commands, all in `toolbar.sh`: `serve` (load your working tree in
a prototype), `vendor` (copy it into a host's `toolbar/`), `status` (which
version every host has), `release`, `unhook` (removes the hooks of the former
git-subtree model). The list of hosts is `hosts.json`.

## Stacking

The bar and its menus sit at `z-index: 10000` so no sticky header, overlay or
dialog of the prototype can cover them. Keep the prototype's own layers below
that; raise the value in `prototype-bar.css` if a host app ever exceeds it.
