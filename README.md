# Prototype toolbar

One toolbar every Effectory UX prototype shares: a dark row above the page to
jump between screens, flip edge cases, compare variants and versions, and hand
out links. It is **published, not copied** — prototypes load it from
`https://effectory-ux.github.io/prototype-toolbar/v2/`, so a release reaches
them without a commit.

## Use it

**Add `?prototype-toolbar` to any prototype URL.** That is the whole rule —
live or localhost, any page.

```
https://effectory-ux.github.io/gtma/novanta-after-overview.html?prototype-toolbar
```

- Without the flag you get the plain prototype. Nothing of the toolbar is even
  requested, so a **tester can never stumble into it**. That is the link you
  hand to participants; **Share** in the bar copies it for you.
- You can append the flag at the **very end** of a link, hash routes included
  (`…/phase-2/#/surveys/s3/questionnaire?prototype-toolbar`) — it is moved into
  the query on arrival. One catch: if you are already *on* a page with a
  `#route` and add the flag in the address bar, the browser does not reload;
  press reload once.
- The bar carries the flag through every jump it makes, so it never disappears
  mid-walkthrough.

In the bar: the **badge** names the version and switches between versions;
**Screens** jumps to a screen, and the switch on each row makes it the screen
the prototype opens on; **Edge cases** and **Variants** flip states; **Share**
gives the tester link, or the colleague link if you toggle the toolbar in.
React prototypes also get **Edit** (inline copy editing, dev only) and
**Events** (the Piwik spec drawn over the live UI). Collapse with Ctrl+` or the
button on the right; the tab on the right screen edge brings it back.

Links from before v2 (`?<key>-toolbar-active`) are dead. The flag is a
convention, not a secret: anyone who knows it can open any wired prototype
with the bar.

## Add it to a prototype

**Static prototype** (Engage design-system HTML). In its root:

```sh
curl -fsSL https://effectory-ux.github.io/prototype-toolbar/v2/adopt.sh | bash -s -- <slug>
```

It creates `toolbar/`, writes `proto-config.js`, puts two tags on every page
that lacks them, and prints the links. Safe to re-run. Then fill in `name`,
`live` and `screens`. Later: `bash toolbar/adopt.sh inject` wires new pages,
`bash toolbar/adopt.sh link [page]` prints the links again.

**React/Vite prototype** (CYOS):

```sh
npm install github:effectory-ux/prototype-toolbar#semver:^2.0.0
```

```jsx
import * as PROTO from "./data/proto-config.js";
import { PrototypeBar } from "prototype-toolbar/PrototypeBar.jsx";

<div className="proto-shell">
  <PrototypeBar config={PROTO} versions={VERSIONS}
    onUseCase={goto} edges={edges} onToggleEdge={toggle} />
  <YourApp />
</div>
```

Add `protoEdits()` from `prototype-toolbar/vite-plugin-proto-edits.js` to the
Vite plugins; with more than one version also `protoVersions(VERSIONS)`.

Or just ask Claude: the `prototype-toolbar` skill does either flavour.

## Keep it truthful

- **Screens the bar learns by itself.** Screens it has shown that no entry
  leads to appear under Screens as "seen here, not in this list". React writes
  them to `public/proto-discovered.json` (commit it) and
  `node node_modules/prototype-toolbar/check.js <package>` fails when any are
  unregistered — run it before committing UI work. Static prototypes keep the
  list in the browser only.
- **Edge cases, variants and start screens only exist in the conversation.**
  When a prompt introduces an account difference, a design variation or a place
  the prototype should open, register it in the config in the same change. A
  state that exists in the app but not in the toolbar is a bug.
- **Never edit `toolbar/` or `node_modules/prototype-toolbar`** — they are
  copies, overwritten on the next update.

## Update it

Static: the bar shows an amber **Update** when the vendored copy is behind →
`toolbar/update.sh`, commit. (Deployed pages already run the newest release;
that copy is only their fallback.) React: `npm update prototype-toolbar`.
A new major: `toolbar/update.sh 3` or `npm install …#semver:^3.0.0`.

## Config reference

**Static** — `proto-config.js` defines `window.PROTO_TOOLBAR`; everything is
optional and a menu with no entries is not rendered. Functions receive the
current `URL`.

| Field | Shape | What it is |
|---|---|---|
| `prefix` | `"gtma"` | localStorage namespace, one per prototype |
| `name` | `"GTMA"` | badge text when the page is in no version |
| `live` | URL | the **site** root on Pages; Share appends this page's path, so one `live` is right even when the repo hosts several prototypes |
| `start` | `"overview.html"` | optional front door. Set it and Share offers "Open at the start"; leave it out and Share always links to the page you are on |
| `versions` | `{key, label, desc, match, go}` | `match` decides which version a page is (string, RegExp or function), `go` is the same screen in another version |
| `screens` | `{key, label, desc, href, group?, default?, match?}` | `default: true` marks the start; a dialog is a screen with a deep-link `href` and a `match` on the query |
| `edgeCases` | `{key, label, desc, on}` | persisted; toggling reloads unless you pass `apply` |
| `variants` | `{key, label, desc, on, href?}` | `href` makes it URL-based, otherwise persisted |
| `startPoints` | `{key, label}` | only for hosts without `screens` |
| `shell` | `false` | opt out of the body-column layout (or per page: `<body data-proto-shell="off">`) |

The page reads its settings back through `window.ProtoToolbar`: `edge(key)`,
`variant(key)`, `startAt(fallback)`, `startPath()`, `seen()`, `plainLink()`,
`carry(url)`, `active`, `version`. It exists on tester pages too, answering
with the config's defaults, so page code needs no `if`.

**React** — the config module exports `PROTO_STORAGE_PREFIX`, `USE_CASES`,
`EDGE_CASES`, `START_POINTS`, `VARIANTS`, `PIWIK_EVENTS`, `PIWIK_FUNNELS`
(camelCase twins work too); handlers stay props. `getStartAt(prefix, fallback)`
reads the chosen start point. The versions registry is a host file at the repo
root: `[{ key, label, desc, port, path, url }]` — `port` for local switching,
`path` for the deployed segment, `url` for Share.

## Change the toolbar itself

```sh
./toolbar.sh serve      # then open a prototype once with ?proto-toolbar-src=http://localhost:8790/
./toolbar.sh status     # which version every host has (hosts.json)
./toolbar.sh release patch|minor|major
```

For React, start the app with `PROTO_TOOLBAR_DEV=<clone>` instead. Keep both
flavours in step: `PrototypeBar.jsx` and `prototype-bar.js`. **Commits change
nothing for anyone — only a release does**, and semver is literal here: major
means a host has to change something.

## How it works

- **Published in lines.** The Pages workflow builds `/v2/` (newest 2.x),
  `/v2.0.1/` (immutable) and `/` (tip of main). Hosts follow a line, so a
  major can land without moving anyone.
- **Loader with a fallback.** A static prototype vendors `toolbar/` and
  includes `toolbar/load.js`. Deployed, it takes the published line first and
  the vendored copy only if that fails; on localhost the other way round. It
  also compares versions and shows the Update chip.
- **Two flavours, one stylesheet.** `PrototypeBar.jsx` (React) and
  `prototype-bar.js` (vanilla) share `prototype-bar.css` and the link rule.
  Copy editing and the event layer are React-only: they need the dev server,
  which the `protoEdits` plugin provides (it also stores discovered screens).
- **Nothing here knows any prototype.** Everything host-specific lives in the
  host's own config. The bar sits at `z-index: 10000` so nothing covers it.
- **The skill.** `skills/prototype-toolbar/` is a Claude skill (and this repo a
  plugin named `effectory-ux`). Its `SKILL.md` is a shell;
  `toolbar-skill.sh sync` fetches the real instructions from `guide.md` here,
  so changing how prototypes are wired is a commit, not a re-upload. See
  `team-plugin/` for the team plugin that will carry every Effectory UX skill.
