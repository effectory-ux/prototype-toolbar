---
name: prototype-toolbar
description: >
  Wires Effectory's shared prototype toolbar into any UX prototype and keeps it current. Use it
  whenever you build a NEW prototype (static HTML on the Engage design system, or React/Vite),
  add a screen, state, dialog, edge case or design variant to an EXISTING prototype, or someone
  asks for a colleague link, tester link, start screen, or "the toolbar". Also use it when asked
  to improve the toolbar itself. The toolbar gives every prototype a dark bar above the page with
  Screens (with a start switch per row), Edge cases, Variants, Share (tester link vs colleague
  link) and, in React prototypes, inline copy editing and the Piwik event layer. It learns the
  screens a prototype shows; edge cases and start points come from prompts, so register them.
---

# Prototype toolbar

One toolbar, shared by every Effectory UX prototype, **published, not copied**:
source and docs at https://github.com/effectory-ux/prototype-toolbar, runtime on
https://effectory-ux.github.io/prototype-toolbar/v1/. This file is only the
shell of the skill. The instructions live in the repo and are fetched live, so
a change there is a commit, never a re-upload of this skill.

## Setup — first thing in a session

```bash
./toolbar-skill.sh sync
```
```
Read(".ds-cache/prototype-toolbar/guide.md")
```

`sync` fetches the current guide, the adopt script and the toolbar README from
the repo into `.ds-cache/prototype-toolbar/` in the project (gitignore
`.ds-cache/`). What ships in this bundle is a cold-start copy: it seeds the
cache and is used when GitHub is unreachable — then say so once and work on.
If `sync` reports that **the skill bundle is outdated** (this file or the
script changed in the repo), tell the user once: the admin re-uploads the
skill in Claude.ai. Work on with the instructions you have.

Then follow the guide. The one rule that must survive even without it:

## The link contract (never break it)

A prototype mints **one key** in its config. The URL with `?<key>-toolbar-active`
shows the bar (colleague link); the same URL without it never even requests the
toolbar (tester link), localhost included. Every navigation the bar performs
carries the flag; Share strips it.

## When to wire it, and when not

The toolbar belongs in prototypes that get reviewed and tested. A demo with one
story to tell does not need it; don't wire it by reflex, ask when in doubt.

## Commands

```bash
./toolbar-skill.sh sync           # refresh guide, adopt script, README (cache + offline fallback)
./toolbar-skill.sh adopt <slug>   # give a static prototype the toolbar and a fresh key
./toolbar-skill.sh status         # what is cached, how old, bundle vs repo version
```
