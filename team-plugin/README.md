# The team plugin — handover

One plugin, `effectory-ux`, holding every Effectory UX skill, so a colleague
installs once and the commands read `/effectory-ux:prototype-toolbar`,
`/effectory-ux:ux-copy`, `/effectory-ux:effectory-design-system`. This folder
is the starting point; the plugin itself is a **new repo** (suggested:
`effectory-ux/skills`).

## Why a separate repo

A plugin's skills are the `skills/<name>/` folders **in its own repo**, and the
plugin's name is what prefixes every command. So one plugin for the whole team
means one repo that gathers the skills — while each skill keeps living, and
being released, in the repo it already has. `sync-skills.sh` does the
gathering: it copies each skill's folder out of its source repo. Nobody edits
skills in the plugin repo.

## Set it up

```sh
# in the new, empty repo
mkdir -p .claude-plugin skills
cp <this folder>/{skills.json,sync-skills.sh,README.md} .
cp <this folder>/templates/plugin.json .claude-plugin/plugin.json
cp <this folder>/templates/marketplace.json .claude-plugin/marketplace.json
./sync-skills.sh          # pulls every skill folder into skills/
git add -A && git commit -m "The Effectory UX skills, in one plugin" && git push
```

Then, once per colleague:

```sh
claude plugin marketplace add effectory-ux/skills
claude plugin install effectory-ux@effectory-ux
```

Or put it in a prototype repo's `.claude/settings.json` so opening the repo
offers it, with no commands at all:

```json
{
  "extraKnownMarketplaces": { "effectory-ux": { "source": { "source": "github", "repo": "effectory-ux/skills" } } },
  "enabledPlugins": { "effectory-ux@effectory-ux": true }
}
```

## Keeping it current

- **Skills that fetch their own content** (prototype-toolbar, design system)
  only need a re-sync when their *instructions* change, not when their content
  does. That is the pattern to prefer for anything that changes often: a thin
  `SKILL.md` plus a script that pulls the live parts into `.ds-cache/`.
- **Static skills** (ux-copy today) need `./sync-skills.sh <name>` and a commit
  whenever their source repo changes.
- Bump `version` in `.claude-plugin/plugin.json` when you publish a change;
  colleagues get it on `claude plugin update effectory-ux`, or automatically if
  they switch auto-update on for the marketplace.

## Where each skill lives

See `skills.json`. Three of the four are ready to sync as they are.
`realistic-content` is not: its `SKILL.md` sits at its repo root beside build
scripts and data, and its shipped bundle is assembled by `build.sh` into
`dist/`. Ask its owner for a plain `skills/realistic-content/` folder in that
repo, then point `path` at it and remove `pending`.

## One channel, not two

A skill delivered as both an Organization Skill (uploaded zip, listed as
`anthropic-skills:<name>`) and a plugin appears **twice** in everyone's skill
list, and both copies answer the same request. Pick per skill. The plugin route
gives the `/effectory-ux:` prefix and reaches Claude Code in the terminal; the
Organization Skill route needs no per-person setup and reaches the desktop app
and Cowork, where plugin support is not documented. When a skill moves to this
plugin, retire its uploaded zip in Claude.ai.

## The stopgap this replaces

`effectory-ux/prototype-toolbar` currently declares the same plugin name
(`effectory-ux`) in its own `.claude-plugin/`, so terminal users can install the
toolbar skill before this repo exists. When this repo goes live: remove that
marketplace (`claude plugin marketplace remove prototype-toolbar`), and delete
`.claude-plugin/marketplace.json` from the toolbar repo so there is one catalog.
The toolbar repo keeps `skills/prototype-toolbar/` — that stays its home, and
this plugin syncs from it.
