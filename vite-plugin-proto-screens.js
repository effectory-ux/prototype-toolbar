// vite-plugin-proto-screens.js — the dev-server half of the toolbar: screen
// discovery (see discover.js). While `vite dev` runs, the browser GETs what is
// already known and POSTs the screens it has seen at /__proto/discovered; the
// union is written to public/proto-discovered.json in the repo, so the list
// ships with the prototype instead of living in one person's browser.
//
// Reliability: responses carry a `proto: true` marker so the client can tell
// this endpoint apart from Vite's SPA fallback (which answers ANY url with
// index.html and a 200 — a dev server started before this plugin existed
// would otherwise look like it was saving). Every write bumps `version` and is
// stamped with time + the local git user.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export function protoScreens({ discoveredFile = "public/proto-discovered.json" } = {}) {
  let discAbs, editor = "unknown";
  const readDisc = () => { try { return JSON.parse(fs.readFileSync(discAbs, "utf8")); } catch (_) { return { version: 0, entries: {} }; } };
  // Union of what the browser knows and what is on disk: another browser or
  // an earlier session may have seen screens this one has not.
  const mergeDisc = (prev, incoming) => {
    const out = Object.assign(Object.create(null), prev.entries || {}); // null prototype: "__proto__" is just a route
    Object.values(incoming || {}).forEach(e => {
      if (!e || !e.route) return;
      const cur = Object.prototype.hasOwnProperty.call(out, e.route) ? out[e.route] : undefined;
      if (!cur) { out[e.route] = { ...e, via: { ...(e.via || {}) } }; return; }
      cur.count = Math.max(cur.count || 0, e.count || 0);
      if (e.firstSeen && (!cur.firstSeen || e.firstSeen < cur.firstSeen)) cur.firstSeen = e.firstSeen;
      if (e.lastSeen && (!cur.lastSeen || e.lastSeen > cur.lastSeen)) { cur.lastSeen = e.lastSeen; cur.example = e.example || cur.example; }
      cur.via = { ...(cur.via || {}), ...(e.via || {}) };
    });
    return out;
  };
  // Only the page this server serves may write: a JSON content type (so a
  // cross-site form or text POST needs a preflight, which the 405 below
  // refuses) and, when the browser sends an Origin, one naming this server.
  const acceptPost = (req, res) => {
    const ct = String(req.headers["content-type"] || ""), origin = req.headers.origin;
    const ok = /^application\/json\b/.test(ct) && (!origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`);
    if (!ok) { res.statusCode = 403; res.end('{"proto":true,"ok":false}'); }
    return ok;
  };
  const readBody = (req, res, done) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 2e6) { res.statusCode = 413; res.end('{"proto":true,"ok":false}'); req.destroy(); } });
    req.on("end", () => done(body));
  };
  return {
    name: "proto-screens",
    configResolved(config) {
      discAbs = path.resolve(config.root, discoveredFile);
      // git config user.name may be unset locally; the repo's last commit
      // author is a fine fallback for local attribution.
      try { editor = execSync("git config user.name", { cwd: config.root }).toString().trim(); } catch (_) {}
      if (!editor || editor === "unknown") {
        try { editor = execSync("git log -1 --format=%an", { cwd: config.root }).toString().trim() || "unknown"; } catch (_) { editor = "unknown"; }
      }
    },
    configureServer(server) {
      // Screen discovery: GET what is known, POST the browser's map; the union
      // is written to public/proto-discovered.json (committed with the repo).
      server.middlewares.use("/__proto/discovered", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.method === "GET") { res.end(JSON.stringify({ proto: true, ...readDisc() })); return; }
        if (req.method === "POST") {
          if (!acceptPost(req, res)) return;
          readBody(req, res, (body) => {
            try {
              const data = JSON.parse(body);
              if (!data.entries || typeof data.entries !== "object") throw new Error("bad shape");
              const prev = readDisc();
              const entries = mergeDisc(prev, data.entries);
              const changed = JSON.stringify(entries) !== JSON.stringify(prev.entries || {});
              if (changed) {
                const next = { version: (prev.version || 0) + 1, savedAt: new Date().toISOString(), editor, entries };
                fs.mkdirSync(path.dirname(discAbs), { recursive: true });
                fs.writeFileSync(discAbs, JSON.stringify(next, null, 2) + "\n");
              }
              res.end(JSON.stringify({ proto: true, ok: true, changed }));
            } catch (_) { res.statusCode = 400; res.end('{"proto":true,"ok":false}'); }
          });
          return;
        }
        res.statusCode = 405; res.end('{"proto":true,"ok":false}');
      });
    },
  };
}
