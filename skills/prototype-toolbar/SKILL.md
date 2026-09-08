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
https://effectory-ux.github.io/prototype-toolbar/v1/. This file is only the
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

A prototype mints **one key** in its config. The URL with `?<key>-toolbar-active`
shows the bar (colleague link); the same URL without it never even requests the
toolbar (tester link), localhost included. Every navigation the bar performs
carries the flag; Share strips it; the page's own navigation uses
`ProtoToolbar.carry(url)`.

## When to wire it, and when not

The toolbar belongs in prototypes that get reviewed and tested. A demo with one
story to tell does not need it. In a prototype that does not have it, ask once
whether to wire it; never adopt by reflex.

## Commands (always by the skill-folder path, from the prototype root)

```bash
bash "<skill folder>/toolbar-skill.sh" sync           # refresh guide, adopt script, README (cache + offline fallback)
bash "<skill folder>/toolbar-skill.sh" adopt <slug>   # give a static prototype the toolbar and a fresh key
bash "<skill folder>/toolbar-skill.sh" status         # what is cached, how old, bundle vs repo version
```

A *slug* is a short lowercase id for the prototype, letters, digits and
hyphens: `gl`, `results`, `ai-scan`.
