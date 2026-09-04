#!/usr/bin/env node
// check.js — what the toolbar has seen that nobody registered.
//
//   node node_modules/prototype-toolbar/check.js [prototype dir]
//
// Reads public/proto-discovered.json (written by the dev server while the
// prototype is used, see discover.js) and prints every screen the bar has
// seen that no Screens entry leads to — the candidates for proto-config.js.
// Exit code 1 when there are any, so it can gate a commit.
import fs from "node:fs";
import path from "node:path";
const dir = path.resolve(process.argv[2] || ".");
const file = path.join(dir, "public", "proto-discovered.json");
let raw;
try { raw = fs.readFileSync(file, "utf8"); }
catch (_) { console.log(`check: no ${path.relative(process.cwd(), file)} yet — use the prototype on its dev server first`); process.exit(0); }
let data;
try { data = JSON.parse(raw); }
catch (e) { console.error(`check: ${path.relative(process.cwd(), file)} is not valid JSON (${e.message})`); process.exit(2); }
const all = Object.values(data.entries || {});
const unreg = all.filter(e => !Object.keys(e.via || {}).length).sort((a, b) => (b.count || 0) - (a.count || 0));
const reg = all.length - unreg.length;
console.log(`check: ${all.length} screen(s) seen, ${reg} reached through a registered Screens entry, ${unreg.length} not.`);
if (unreg.length) {
  console.log("\nSeen, but no Screens entry leads there — register in proto-config.js (USE_CASES) or decide they are not screens:");
  unreg.forEach(e => console.log(`  ${e.route}\n      seen ${e.count}×, last ${String(e.lastSeen || "").slice(0, 16).replace("T", " ")}, e.g. ${e.example}`));
  process.exit(1);
}
