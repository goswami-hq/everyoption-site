// A profile with no listed procedure says "Call and ask about:" public procedures only (ai-hq job platform-directory-0032,
// stage 4; plan review item 2: before, it listed every key, draft pelvic and HAE included). Doctors' account Add options
// still offer every procedure at stage listed or public, unchanged.  node --test tools/ask-about.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleDoctor, resetDirectory } from "../lib/directory.mjs";
import { PROCS, PROC_LONG, PROC_SHORT } from "../lib/procedures.mjs";

const SITE = new URL("../site/", import.meta.url);
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); } } };
const REG = JSON.parse(readFileSync(new URL("../content/procedures.json", import.meta.url), "utf8"));
const PUBLIC = REG.filter((p) => p.stage === "public").map((p) => p.key);
const LISTED = REG.filter((p) => p.stage === "listed" || p.stage === "public").map((p) => p.key);
const DIR = JSON.parse(read("data/directory.json")).people;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const html = async (path) => { resetDirectory(); return (await handleDoctor(new Request(`http://localhost${path}`), { backend: null, noCache: true, ASSETS })).text(); };

test("no listed procedure: call and ask about public procedures only, in the list and the description", async () => {
  const ask = PUBLIC.length ? PUBLIC : LISTED;
  assert.ok(ask.length > 0);
  const none = DIR.filter((p) => !p.l);
  assert.ok(none.length > 0, "the directory has profiles with no listed procedure");
  for (const p of none.slice(0, 25)) {
    const h = await html(p.p);
    const list = h.match(/Call and ask about:<\/p><ul class="dir-procs">(.*?)<\/ul>/)[1];
    assert.deepEqual([...list.matchAll(/<li><a href="[^"]+">([^<]+)<\/a><\/li>/g)].map((m) => m[1]), ask.map((k) => esc(PROC_LONG[k])), p.p);
    const desc = h.match(/<meta name="description" content="([^"]*)">/)[1];
    assert.ok(desc.endsWith(`how to ask about ${ask.map((k) => PROC_SHORT[k]).join(", ")}.`), desc);
    for (const k of LISTED.filter((k) => !ask.includes(k))) assert.ok(!list.includes(esc(PROC_LONG[k])), `${p.p} offers ${k}, which is not public`);
  }
});

test("a profile with listed procedures is unchanged by it: it shows its own, draft ones included", async () => {
  const hae = DIR.find((p) => p.l && p.l.split(" ").includes("hae"));
  const h = await html(hae.p);
  assert.ok(!h.includes("Call and ask about:"));
  assert.ok(h.includes(esc(PROC_LONG.hae)));
});

test("doctors' account Add options: every procedure at stage listed or public, as before", () => {
  const w = {}; new Function("window", read("assets/procedures.js"))(w);
  assert.deepEqual(w.EO_PROCS.keys, LISTED);
  assert.deepEqual(PROCS, LISTED);
});
