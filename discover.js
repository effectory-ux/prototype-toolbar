// discover.js — what the toolbar LEARNS from a prototype while it is used.
//
// A prototype's config lists the screens someone bothered to register. The
// prototype itself shows more than that — every state has a route — and the
// gap between the two is exactly what a designer forgets to put in the
// toolbar. So the bar watches the route while you click around and keeps a
// map of every distinct screen it has seen:
//
//   { route: "/surveys/:id/questionnaire(dialog:select-questions)",   normalized key
//     example: "#/surveys/s3/questionnaire(dialog:select-questions)", a real instance
//     label: "questionnaire · select-questions",                       derived from the route
//     count, firstSeen, lastSeen,
//     via: { "select-questions": true } }                              Screens entries that led here
//
// `via` is learned too: when a Screens entry is picked, the route it lands on
// gets that entry's key. A route nobody registered has an empty `via` — the
// bar lists those as "seen here, not in this list", and check.js prints them
// for the agent maintaining proto-config.js.
//
// Where it lives: localStorage always (per prototype); on a dev host also
// public/proto-discovered.json in the repo through the dev server (the
// protoEdits vite plugin serves /__proto/discovered), so it is committed with
// the prototype and the deployed bar shows it too. Nothing here is
// prototype-specific.
import { isDevHost } from "./copyEdit.js";

const ENDPOINT = "/__proto/discovered";
const STATIC_FILE = "proto-discovered.json";

// One key per screen: ids collapse so `/surveys/s3/…` and `/surveys/s7/…`
// are the same screen. Hosts with their own id shapes can pass `routeKey`.
export function routeKey(raw) {
  let r = String(raw || "").replace(/^#/, "");
  if (!r) return "/";
  r = r.replace(/\(dialog:([^/)]+)\/[^)]*\)/g, "(dialog:$1/:arg)");   // dialog argument
  r = r.replace(/\/\d+(?=\/|$|\()/g, "/:n");                           // numeric ids
  r = r.replace(/\/[a-z]{1,2}\d+(?=\/|$|\()/gi, "/:id");               // s3, q12, t7
  return r;
}
export function routeLabel(key) {
  const m = key.match(/^(.*?)(?:\(dialog:([^/)]+)(?:\/[^)]*)?\))?$/);
  const path = (m && m[1]) || key;
  const seg = path.split("/").filter(s => s && !s.startsWith(":")).pop() || "home";
  return m && m[2] ? `${seg} · ${m[2]}` : seg;
}

const now = () => new Date().toISOString();

export function createDiscovery({ prefix = "proto", routeKey: keyFn = routeKey } = {}) {
  const storeKey = prefix + ".discovered";
  let entries = {};
  let canWrite = false, pendingVia = null, pendingAt = 0, timer = null, onChange = () => {};

  const load = () => { try { merge(JSON.parse(localStorage.getItem(storeKey) || "{}")); } catch (_) {} };
  const persistLocal = () => { try { localStorage.setItem(storeKey, JSON.stringify(entries)); } catch (_) {} };
  const merge = (incoming) => {
    Object.values(incoming || {}).forEach(e => {
      if (!e || !e.route) return;
      const cur = entries[e.route];
      if (!cur) { entries[e.route] = { ...e, via: { ...(e.via || {}) } }; return; }
      cur.count = Math.max(cur.count || 0, e.count || 0);
      if (e.firstSeen && (!cur.firstSeen || e.firstSeen < cur.firstSeen)) cur.firstSeen = e.firstSeen;
      if (e.lastSeen && (!cur.lastSeen || e.lastSeen > cur.lastSeen)) { cur.lastSeen = e.lastSeen; cur.example = e.example || cur.example; }
      Object.assign(cur.via, e.via || {});
    });
  };
  const push = () => {
    if (!canWrite) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) });
      } catch (_) {}
    }, 800);
  };

  const current = () => window.location.hash || window.location.pathname;
  const record = () => {
    const raw = current();
    const key = keyFn(raw);
    const e = entries[key] || (entries[key] = { route: key, example: raw, label: routeLabel(key), count: 0, firstSeen: now(), via: {} });
    e.count += 1; e.lastSeen = now(); e.example = raw;
    if (pendingVia && Date.now() - pendingAt < 4000) { e.via[pendingVia] = true; pendingVia = null; }
    persistLocal(); push(); onChange();
  };
  let debounce = null;
  const scheduleRecord = () => { clearTimeout(debounce); debounce = setTimeout(record, 250); };

  const api = {
    // Boot: read what is already known (dev server → static file → localStorage),
    // then start watching the route. `cb` fires on every change.
    async init(cb) {
      onChange = cb || (() => {});
      load();
      let data = null;
      try {
        if (!isDevHost()) throw 0;
        const r = await fetch(ENDPOINT);
        if (r.ok) { const j = await r.json(); if (j && j.proto === true) { data = j; canWrite = true; } }
      } catch (_) {}
      if (!data) { try { const r = await fetch(STATIC_FILE); if (r.ok) data = await r.json(); } catch (_) {} }
      if (data && data.entries) merge(data.entries);
      // Routes are written with replaceState as often as with the hash, so
      // watch both; History has no event of its own.
      window.addEventListener("hashchange", scheduleRecord);
      window.addEventListener("popstate", scheduleRecord);
      ["pushState", "replaceState"].forEach(m => {
        const orig = history[m];
        history[m] = function () { const r = orig.apply(this, arguments); scheduleRecord(); return r; };
      });
      scheduleRecord();
      onChange();
    },
    entries: () => Object.values(entries).sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || "")),
    // Seen, but no Screens entry leads there.
    unregistered: () => api.entries().filter(e => !Object.keys(e.via || {}).length),
    // The route we land on next was reached through this Screens entry. Record
    // even if the route does not change (picking the screen you are on).
    note: (useCaseKey) => { pendingVia = useCaseKey; pendingAt = Date.now(); clearTimeout(debounce); debounce = setTimeout(record, 700); },
    current, routeKey: keyFn, canWrite: () => canWrite,
  };
  return api;
}

// ---- "Start on this screen" -------------------------------------------------
// A start point the prototype did not register: a plain route, remembered per
// prototype (origin + path, so phases and deploys don't share one) and applied
// before the app reads its first hash. Runs at import time on purpose — that
// is the only moment early enough — and only when the toolbar is active.
const startKey = () => "proto.startRoute@" + window.location.origin + window.location.pathname;
export const getStartRoute = () => { try { return localStorage.getItem(startKey()); } catch (_) { return null; } };
export const setStartRoute = (route) => { try { route ? localStorage.setItem(startKey(), route) : localStorage.removeItem(startKey()); } catch (_) {} };
(function applyStartRoute() {
  try {
    if (!(isDevHost() || /-toolbar-active/.test(window.location.search))) return;
    const r = getStartRoute();
    if (r && !window.location.hash && r.startsWith("#")) window.location.replace(window.location.pathname + window.location.search + r);
  } catch (_) {}
})();
