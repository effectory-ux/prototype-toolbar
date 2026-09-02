// vite-plugin-proto-versions.js — the dev-server side of the toolbar's
// version switcher: lets the page you are looking at start a sibling
// version's dev server before navigating there. A browser cannot spawn
// processes; the Vite server behind the page can. Dev-only (apply: "serve"),
// so builds and deploys never carry it.
//
// Wire it into every version's vite config, with the host's registry:
//
//   import { protoVersions } from "../toolbar/vite-plugin-proto-versions.js";
//   import { VERSIONS } from "../prototype-versions.js";
//   plugins: [react(), protoVersions(VERSIONS)]
//
//   POST /__proto/versions/start  {key}  → checks that version's port, spawns
//     `npm run dev` in its folder (a sibling of this one) when it is down,
//     answers {up:true} once the port accepts connections — or {up:false}
//     after ~20s so the toolbar can say it could not start it.
//   GET  /__proto/versions/status?key=…  → {up} without starting anything.
//   GET  /__proto/versions/freshness?key=…  → {ahead, commits, dirty}: is the
//     LOCAL prototype ahead of its live deploy? Compares the commit stamp the
//     deploy workflow writes to <live url>/version.json against local git —
//     commits since that stamp touching the version's folder (or the shared
//     toolbar/registry), plus uncommitted changes there. A live site without
//     a stamp (predates stamping, or never deployed) counts as ahead.
import { spawn, execFile } from "node:child_process";
import net from "node:net";
import path from "node:path";

// Vite binds "localhost", which on some systems is only the IPv6 loopback —
// probe both families before calling a port down.
const hostUp = (port, host) => new Promise((resolve) => {
  const s = net.createConnection({ port, host }, () => { s.destroy(); resolve(true); });
  s.on("error", () => resolve(false));
  s.setTimeout(700, () => { s.destroy(); resolve(false); });
});
const portUp = async (port) => (await hostUp(port, "127.0.0.1")) || hostUp(port, "::1");

const waitUp = async (port, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await portUp(port)) return true;
    await new Promise(r => setTimeout(r, 350));
  }
  return false;
};

const git = (cwd, args) => new Promise((resolve) => {
  execFile("git", args, { cwd }, (err, stdout) => resolve(err ? null : stdout.trim()));
});

// Paths that end up in a version's deployed bundle: its own folder plus the
// shared toolbar and the registry.
const versionPaths = (v) => [v.path, "toolbar", "prototype-versions.js"];

const freshness = async (root, v) => {
  if (!v.url) return { ahead: null };
  let stamp = null;
  try {
    const r = await fetch(new URL("version.json", v.url), { signal: AbortSignal.timeout(4000) });
    if (r.ok) stamp = await r.json();
  } catch (_) { return { ahead: null }; } // offline — say nothing rather than guess
  const repo = path.resolve(root, "..");
  const dirty = !!(await git(repo, ["status", "--porcelain", "--", ...versionPaths(v)]));
  if (!stamp || !stamp.commit) return { ahead: true, commits: null, dirty };
  const known = await git(repo, ["cat-file", "-t", stamp.commit]);
  if (known !== "commit") return { ahead: true, commits: null, dirty }; // live built from history we don't have
  const count = await git(repo, ["rev-list", "--count", `${stamp.commit}..HEAD`, "--", ...versionPaths(v)]);
  const commits = count === null ? 0 : parseInt(count, 10) || 0;
  return { ahead: commits > 0 || dirty, commits, dirty };
};

export function protoVersions(versions = []) {
  const spawned = new Set(); // don't double-spawn on rapid clicks
  return {
    name: "proto-versions",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root; // this version's own folder
      server.middlewares.use((req, res, next) => {
        const [url, query] = (req.url || "").split("?");
        if (!url.startsWith("/__proto/versions/")) return next();
        const send = (code, obj) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
        };

        if (url === "/__proto/versions/freshness" && req.method === "GET") {
          const v = versions.find(x => x.key === new URLSearchParams(query || "").get("key"));
          if (!v) return send(404, { error: "unknown version" });
          freshness(root, v).then(f => send(200, f));
          return;
        }

        if (url === "/__proto/versions/status" && req.method === "GET") {
          const v = versions.find(x => x.key === new URLSearchParams(query || "").get("key"));
          if (!v) return send(404, { error: "unknown version" });
          portUp(v.port).then(up => send(200, { up }));
          return;
        }

        if (url === "/__proto/versions/start" && req.method === "POST") {
          let body = "";
          req.on("data", c => { body += c; });
          req.on("end", async () => {
            let key = null;
            try { key = JSON.parse(body || "{}").key; } catch (_) {}
            const v = versions.find(x => x.key === key);
            if (!v) return send(404, { error: "unknown version" });
            if (await portUp(v.port)) return send(200, { up: true, started: false });
            if (!spawned.has(v.key)) {
              spawned.add(v.key);
              const child = spawn("npm", ["run", "dev"], {
                cwd: path.resolve(root, "..", v.path),
                detached: true, stdio: "ignore", env: process.env,
              });
              child.on("error", () => spawned.delete(v.key));
              child.unref();
            }
            send(200, { up: await waitUp(v.port), started: true });
          });
          return;
        }

        next();
      });
    },
  };
}
