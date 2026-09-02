// versions.js — generic version-switching logic for the toolbar.
//
// The registry of versions is HOST data (in CYOS: prototype-versions.js at
// the repo root) and reaches the bar through the PrototypeBar `versions`
// prop; these helpers only interpret such a list. Each entry:
//   { key, label, desc, port, path, toolbarKey }
// See the host registry file for what each field means.
import { isDevHost } from "./copyEdit.js";

// Which registry entry is the page you are on: the deployed path segment
// first, the dev port as fallback — derived from the URL, so versions can
// share every source file without a per-version identity constant.
export const currentVersion = (versions) => {
  try {
    const loc = window.location;
    const segs = loc.pathname.split("/");
    return versions.find(v => segs.includes(v.path))
        || versions.find(v => String(v.port) === loc.port)
        || null;
  } catch (_) { return null; }
};

// A link to the same step in another version: same hash route, and the
// toolbar carried along (implicit on a dev host, via the key elsewhere).
export const versionUrl = (versions, v) => {
  try {
    const loc = window.location;
    let u;
    if (isDevHost()) {
      u = new URL(`${loc.protocol}//${loc.hostname}:${v.port}/`);
    } else {
      const cur = currentVersion(versions);
      const path = cur && loc.pathname.includes(`/${cur.path}/`)
        ? loc.pathname.replace(`/${cur.path}/`, `/${v.path}/`)
        : `/${v.path}/`;
      u = new URL(path, loc.origin);
      u.search = `?${v.toolbarKey}-toolbar-active`;
    }
    u.hash = loc.hash;
    return u.toString();
  } catch (_) { return "#"; }
};

// Deployed only: is the sibling actually published on this site? The registry
// can run ahead of the deploys (a new version exists in the repo before its
// first publish), and the switcher should say so rather than link into a 404.
export const versionAvailable = async (versions, v) => {
  if (isDevHost()) return true; // dev has the auto-start path instead
  try {
    const r = await fetch(versionUrl(versions, v), { method: "HEAD" });
    return r.ok;
  } catch (_) { return false; }
};

// The live (deployed) address of THIS version — the link you hand to anyone.
// Built from the registry's `url`, so it is right from localhost too, and
// always points at the version you are on rather than at whatever was
// deployed last. By default it opens at the prototype's start; `page: true`
// carries the current screen (the hash route) along. Null when the registry
// has no live address.
export const liveShareUrl = (versions, { toolbar = false, page = false } = {}) => {
  try {
    const cur = currentVersion(versions);
    if (!cur || !cur.url) return null;
    const u = new URL(cur.url);
    if (toolbar && cur.toolbarKey) u.search = `?${cur.toolbarKey}-toolbar-active`;
    if (page) u.hash = window.location.hash;
    return u.toString();
  } catch (_) { return null; }
};

// Dev only: is the local prototype ahead of its live deploy? Answered by the
// protoVersions vite plugin (it can read git; the page cannot). Null when it
// cannot tell — no plugin, no live address, offline.
export const versionFreshness = async (v) => {
  if (!isDevHost()) return null;
  try {
    const r = await fetch(`/__proto/versions/freshness?key=${encodeURIComponent(v.key)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.ahead === "boolean" ? j : null;
  } catch (_) { return null; }
};

// Dev only: ask the dev server BEHIND THIS PAGE to make sure the sibling's
// dev server runs (starting it if needed) before we navigate to it — a page
// cannot spawn processes, but its Vite server can (the protoVersions plugin).
// Resolves false only on a definite "could not start"; a missing endpoint
// (a host without the plugin) lets the navigation just proceed and find out.
export const ensureVersionServer = async (v) => {
  try {
    const r = await fetch("/__proto/versions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: v.key }),
    });
    if (!r.ok) return true;
    const j = await r.json();
    return j.up !== false;
  } catch (_) { return true; }
};
