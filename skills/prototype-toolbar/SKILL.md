---
name: prototype-toolbar
description: >
  Wires Effectory's shared prototype toolbar into a UX prototype and keeps it truthful. Use it
  whenever you build a NEW prototype (static HTML on the Engage design system, or React/Vite), or
  add a screen, state, dialog, edge case, design variant or version (before/after) to a prototype
  that HAS the toolbar, or someone asks for a colleague link, tester link, share link, start screen,
  or "the toolbar". Also use it when asked to improve the toolbar itself. The toolbar is a dark bar
  above the page with Screens (each row with a start switch), Edge cases, Variants, a version
  switcher and Share (tester link vs colleague link); React prototypes also get inline copy
  editing and the Piwik event layer. It learns the screens a prototype shows; edge cases, variants
  and start screens come from prompts, so register them.
---

# Prototype toolbar

One toolbar, shared by every Effectory UX prototype, **published, not copied**:
source and docs at https://github.com/effectory-ux/prototype-toolbar, runtime on
https://effectory-ux.github.io/prototype-toolbar/v2/. This file is only the
shell of the skill. The instructions live in the repo and are fetched live, so
a change there is a commit in the repo, never a re-upload of this skill.

## Setup — first thing in a session

The script sits **next to this file**, in the skill folder. Run it by that
path, from the **prototype's root** — everything it writes lands in the
current directory:

```bash
bash "<folder of this SKILL.md>/toolbar-skill.sh" sync
```
```
Read(".ds-cache/prototype-toolbar/guide.md")
```

`sync` fetches the current guide, the adopt script and the toolbar README from
the repo into `.ds-cache/prototype-toolbar/` in the project and adds
`.ds-cache/` to the project's `.gitignore`. What ships in this bundle is a
cold-start copy: it seeds the cache and is used when GitHub is unreachable —
then say so once and work on. If `sync` reports that **the skill bundle is
outdated** (this file or the script changed in the repo), tell the user once:
the admin re-uploads the zip in Claude.ai, or for a Claude Code plugin install
`claude plugin update prototype-toolbar`. Work on with the instructions you have.

Then follow the guide. The one rule that must survive even without it:

## The link contract (never break it)

One flag, every prototype: **`?prototype-toolbar`**. A URL carrying it shows
the bar (colleague link); the same URL without it never even requests the
toolbar (tester link), localhost included. It may be appended at the very end
of any link, hash routes included. Every navigation the bar performs carries
it; Share strips it; the page's own navigation uses `ProtoToolbar.carry(url)`.
Links from before v2 (`?<key>-toolbar-active`) are dead — never hand one out.

## When to wire it, and when not

The toolbar belongs in prototypes that get reviewed and tested. A demo with one
story to tell does not need it. In a prototype that does not have it, ask once
whether to wire it; never adopt by reflex.

## Invoked directly — `/prototype-toolbar [link [page] | adopt <slug> | inject | status]`

When the user calls the skill by name with nothing else, do the trick, in
the current prototype's root:

1. `sync` (above), then look at the folder:
   - `toolbar.sh` + `prototype-bar.js` here → **this is the toolbar's own
     repo**. Don't wire anything; this is the "improve the toolbar" case in
     the guide (serve it, try it in a prototype, release when asked).
   - `proto-config.js` → a wired static prototype.
   - `prototype-toolbar` in a `package.json` → a wired React prototype.
   - none of those → a prototype without the toolbar.
2. **A prototype without the toolbar:** ask once for a slug (offer one from the folder or repo name),
   confirm it should get the toolbar (see "When to wire it"), then `adopt <slug>`.
   Show the links it printed and the pages it listed as needing hand-wiring;
   then help fill `proto-config.js` (real `name`, the `screens`) from the pages
   you see. React prototypes are wired by hand: follow the guide.
3. **A wired prototype:** `link [page]` and show the colleague link and the tester link,
   local and live. If the user named a page, use it. Mention `inject` when new
   pages lack the tags.

With an argument, do just that: `link [page]`, `adopt <slug>`, `inject`, `status`.

## Commands (always by the skill-folder path, from the prototype root)

```bash
bash "<skill folder>/toolbar-skill.sh" sync           # refresh guide, adopt script, README (cache + offline fallback)
bash "<skill folder>/toolbar-skill.sh" adopt <slug>   # wire a static prototype: toolbar/, config, tags on every page, links
bash "<skill folder>/toolbar-skill.sh" link [page]    # colleague link + tester link, localhost (port 3000) and live
bash "<skill folder>/toolbar-skill.sh" inject         # tags on any page that lacks them
bash "<skill folder>/toolbar-skill.sh" status         # what is cached, how old, bundle vs repo version
```

A *slug* is a short lowercase id for the prototype, letters, digits and
hyphens: `gl`, `results`, `ai-scan`.
