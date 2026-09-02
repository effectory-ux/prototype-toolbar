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
import { spawn } from "node:child_process";
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
