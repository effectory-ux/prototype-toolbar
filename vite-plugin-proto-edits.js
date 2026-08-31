// vite-plugin-proto-edits.js — the dev-server half of the toolbar's copy
// editing (see copyEdit.js). While `vite dev` runs, the browser can GET and
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

export function protoEdits({ file = "public/proto-edits.json", historyFile = "proto-edits-history.jsonl" } = {}) {
  let abs, historyAbs, editor = "unknown";
  const read = () => { try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch (_) { return { version: 0, edits: [] }; } };
  return {
    name: "proto-edits",
    configResolved(config) {
      abs = path.resolve(config.root, file);
      historyAbs = path.resolve(config.root, historyFile);
      // git config user.name may be unset locally; the repo's last commit
      // author is a fine fallback for local attribution.
      try { editor = execSync("git config user.name", { cwd: config.root }).toString().trim(); } catch (_) {}
      if (!editor || editor === "unknown") {
        try { editor = execSync("git log -1 --format=%an", { cwd: config.root }).toString().trim() || "unknown"; } catch (_) { editor = "unknown"; }
      }
    },
    configureServer(server) {
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
