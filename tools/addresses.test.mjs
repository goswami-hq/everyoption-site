// Job platform-main-0015: the knee page moved from /arthritis-embolization/ to /knee-arthritis/ (address rule: docs/addresses.md).
// Each old address answers with one 301 straight to the new page (no chain), and the new page answers 200.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SITE = new URL("../site/", import.meta.url).pathname;
const MOVES = [["/arthritis-embolization/", "/knee-arthritis/"], ["/arthritis-embolization", "/knee-arthritis/"],
  ["/gae/", "/knee-arthritis/"], ["/gae", "/knee-arthritis/"]];

test("old knee addresses: one 301 each to /knee-arthritis/, which answers 200", async () => {
  const port = 8801;
  const srv = spawn(process.execPath, [new URL("./dev-server.mjs", import.meta.url).pathname, String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise((ok) => srv.stdout.once("data", ok));
    for (const [from, to] of MOVES) {
      const r = await fetch(`http://localhost:${port}${from}`, { redirect: "manual" });
      assert.equal(r.status, 301, from); assert.equal(r.headers.get("location"), to, from);
      const next = await fetch(`http://localhost:${port}${to}`, { redirect: "manual" });
      assert.equal(next.status, 200, `${from} -> ${to} is one hop`);
    }
    const q = await fetch(`http://localhost:${port}/arthritis-embolization/?zip=60611`, { redirect: "manual" });
    assert.equal(q.headers.get("location"), "/knee-arthritis/?zip=60611", "query kept");
  } finally { srv.kill(); }
});

test("no built page keeps the old knee address, except _redirects", () => {
  assert.ok(!existsSync(path.join(SITE, "arthritis-embolization")), "old folder removed");
  assert.ok(existsSync(path.join(SITE, "knee-arthritis", "index.html")));
  const hits = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|xml|js|mjs|json|txt)$/.test(f) && readFileSync(p, "utf8").includes("arthritis-embolization")) hits.push(p); } };
  walk(SITE);
  assert.deepEqual(hits, []);
  const rules = readFileSync(path.join(SITE, "_redirects"), "utf8").split("\n").filter((l) => l.includes("arthritis-embolization"));
  assert.deepEqual(rules, ["/arthritis-embolization /knee-arthritis/ 301", "/arthritis-embolization/ /knee-arthritis/ 301"]);
});
