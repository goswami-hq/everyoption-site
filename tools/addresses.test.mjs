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

// Job platform-main-0024: the pelvic page moved from /pelvic-vein-pain/ to /chronic-pelvic-pain/ (the condition's patient
// name, "Chronic pelvic pain"). One 301 straight to the new page, which answers 200; no built page keeps the old address.
test("old pelvic address: one 301 to /chronic-pelvic-pain/, which answers 200", async () => {
  const port = 8802;
  const srv = spawn(process.execPath, [new URL("./dev-server.mjs", import.meta.url).pathname, String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise((ok) => srv.stdout.once("data", ok));
    for (const from of ["/pelvic-vein-pain/", "/pelvic-vein-pain"]) {
      const r = await fetch(`http://localhost:${port}${from}`, { redirect: "manual" });
      assert.equal(r.status, 301, from); assert.equal(r.headers.get("location"), "/chronic-pelvic-pain/", from);
    }
    const next = await fetch(`http://localhost:${port}/chronic-pelvic-pain/`, { redirect: "manual" });
    assert.equal(next.status, 200, "one hop");
  } finally { srv.kill(); }
});

test("no built page keeps the old pelvic address, except _redirects; home lists Chronic pelvic pain with its finder", () => {
  assert.ok(!existsSync(path.join(SITE, "pelvic-vein-pain")), "old folder removed");
  const hits = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|xml|js|mjs|json|txt)$/.test(f) && readFileSync(p, "utf8").includes("pelvic-vein-pain")) hits.push(p); } };
  walk(SITE);
  assert.deepEqual(hits, []);
  const home = readFileSync(path.join(SITE, "index.html"), "utf8");
  const list = home.match(/<ul class="fork-list stops">(.*?)<\/ul>/s)[1];
  assert.match(list, /<li class="t-cpp"><a href="\/chronic-pelvic-pain\/"><strong>Chronic pelvic pain<\/strong>/);
  // job platform-directory-0009: the pelvic finder came, so the home ZIP list offers it and the card shows the count
  assert.match(home, /<option value="\/chronic-pelvic-pain\/">Chronic pelvic pain<\/option>/, "ZIP option now the finder exists");
  assert.match(list, /<li class="t-cpp"><a href="\/chronic-pelvic-pain\/"><strong>Chronic pelvic pain<\/strong><span class="proc">Pelvic vein treatment<\/span><span class="count">\d+ doctors listed<\/span>/);
  // the pelvic card no longer says "Doctor list coming"; hemorrhoids does, until its finder exists (2026-11-11)
  assert.doesNotMatch(home, /<li class="t-cpp">(?:(?!<\/li>).)*Doctor list coming/);
  const page = readFileSync(path.join(SITE, "chronic-pelvic-pain", "index.html"), "utf8");
  assert.match(page, /<meta name="robots" content="noindex/, "still a draft");
});
