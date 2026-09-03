# Prototype toolbar (vendored copy)

This folder is a **copy** of the prototype toolbar, taken from its published
release line — see `version.json` for which release. The toolbar's source and
documentation live in **github.com/effectory-ux/prototype-toolbar**.

- On the deployed prototype the page loads the *published* toolbar first and
  falls back to this copy only if that fails, so a toolbar release reaches
  this prototype without a commit here.
- On localhost the page loads *this copy* first (instant, works offline).
- The bar shows an **Update** hint when this copy is behind the published
  release. Refresh it with `toolbar/update.sh` and commit the result.

Don't edit these files here: the next update overwrites them. Change the
toolbar in its own repo and release it. What this prototype puts IN the
toolbar (its key, screens, versions, edge cases) is the host's own
`proto-config.js`, outside this folder.
