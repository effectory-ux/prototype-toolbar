// vite-plugin-proto-edits.js — the dev-server half of the toolbar: copy
// editing (see copyEdit.js) and screen discovery (see discover.js). While `vite dev` runs, the browser can GET and
// POST the set of text overrides at /__proto/edits; every POST is written
// straight to public/proto-edits.json in the repo, so an edit made in the
// browser lands on disk in real time.
//
// Reliability: responses carry a `proto: true` marker so the client can tell
// this endpoint apart from Vite's SPA fallback (which answers ANY url with
// index.html and a 200 — a dev server started before this plugin existed
// would otherwise look like it was saving). Every save bumps `version`, is
// stamped with time + the local git user, and is appended as a snapshot to
// proto-edits-history.jsonl (gitignored: fine-grained local undo trail; the
// durable versioning of the current state is the git history of
// public/proto-edits.json itself).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export function protoEdits({ file = "public/proto-edits.json", historyFile = "proto-edits-history.jsonl", discoveredFile = "public/proto-discovered.json" } = {}) {
  let abs, historyAbs, discAbs, editor = "unknown";
  const read = () => { try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch (_) { return { version: 0, edits: [] }; } };
  const readDisc = () => { try { return JSON.parse(fs.readFileSync(discAbs, "utf8")); } catch (_) { return { version: 0, entries: {} }; } };
  // Union of what the browser knows and what is on disk: another browser or
  // an earlier session may have seen screens this one has not.
  const mergeDisc = (prev, incoming) => {
    const out = { ...(prev.entries || {}) };
    Object.values(incoming || {}).forEach(e => {
      if (!e || !e.route) return;
      const cur = out[e.route];
      if (!cur) { out[e.route] = { ...e, via: { ...(e.via || {}) } }; return; }
      cur.count = Math.max(cur.count || 0, e.count || 0);
      if (e.firstSeen && (!cur.firstSeen || e.firstSeen < cur.firstSeen)) cur.firstSeen = e.firstSeen;
      if (e.lastSeen && (!cur.lastSeen || e.lastSeen > cur.lastSeen)) { cur.lastSeen = e.lastSeen; cur.example = e.example || cur.example; }
      cur.via = { ...(cur.via || {}), ...(e.via || {}) };
    });
    return out;
  };
  return {
    name: "proto-edits",
    configResolved(config) {
      abs = path.resolve(config.root, file);
      historyAbs = path.resolve(config.root, historyFile);
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
          let body = "";
          req.on("data", (c) => { body += c; });
          req.on("end", () => {
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
      server.middlewares.use("/__proto/edits", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.method === "GET") {
          res.end(JSON.stringify({ proto: true, ...read() }));
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (c) => { body += c; });
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              if (!Array.isArray(data.edits)) throw new Error("bad shape");
              const prev = read();
              const next = {
                proto: true,
                version: (prev.version || 0) + 1,
                savedAt: new Date().toISOString(),
                editor,
                edits: data.edits,
              };
              fs.mkdirSync(path.dirname(abs), { recursive: true });
              fs.writeFileSync(abs, JSON.stringify(next, null, 2) + "\n");
              fs.appendFileSync(historyAbs, JSON.stringify(next) + "\n");
              res.end(JSON.stringify({ proto: true, ok: true, version: next.version }));
            } catch (_) { res.statusCode = 400; res.end('{"proto":true,"ok":false}'); }
          });
          return;
        }
        res.statusCode = 405; res.end('{"proto":true,"ok":false}');
      });
    },
  };
}
