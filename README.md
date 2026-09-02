# Prototype toolbar

A self-contained toolbar for React prototypes, in the spirit of the Figma /
Claude Design prototype chrome: a dark, compact row **above** the prototype
(never an overlay) with four menus — jump to a **use case**, flip **edge
cases**, compare **variants**, choose the **start point** — plus an **Events**
mode (the Piwik analytics spec drawn over the live UI) and the current deep
link with a copy button. Hide it with Ctrl+` or the close button; a peek tab
on the right screen edge brings it back.

This folder lives at the **repo root** and knows nothing about any one
prototype: it is the single toolbar every phase imports (phase-2 does so from
`phase-2/src/app.jsx` and `phase-2/vite.config.js`). Everything
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

## Dropping it into another project

1. Copy this folder.
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

## One shared toolbar across prototypes

The canonical copy of this folder lives at
**github.com/effectory-ux/prototype-toolbar** — improve the toolbar THERE (or
here, then publish), so every prototype that embeds it can pull the same
updates. A host repo embeds it as a git subtree named `toolbar/`:

```sh
# adopt it in a new prototype repo (once)
git subtree add  --prefix=toolbar https://github.com/effectory-ux/prototype-toolbar.git main --squash

# pull the latest toolbar into a host repo
git subtree pull --prefix=toolbar https://github.com/effectory-ux/prototype-toolbar.git main --squash

# publish toolbar changes made inside a host repo back upstream
git subtree push --prefix=toolbar https://github.com/effectory-ux/prototype-toolbar.git main
```

Keep everything host-specific OUT of this folder — the versions registry
(`prototype-versions.js`), proto-config, use cases — so a subtree pull never
collides with a host's own setup. Everything in here must stay generic.

## Stacking

The bar and its menus sit at `z-index: 10000` so no sticky header, overlay or
dialog of the prototype can cover them. Keep the prototype's own layers below
that; raise the value in `prototype-bar.css` if a host app ever exceeds it.
