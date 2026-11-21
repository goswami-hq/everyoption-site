// City notes: facts only one city has (content/city-notes.json; ai-hq HQ chat 2026-11-21 10:41 CT, his yes:
// "Yes but let's make sure we format it in a readable way"). node --test tools/city-notes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleCity, resetCities } from "../lib/cities.mjs";
import { resetDirectory } from "../lib/directory.mjs";
import { CITIES } from "../lib/cities-data.mjs";

const SITE = new URL("../site/", import.meta.url);
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const get = async (path) => {
  resetCities(); resetDirectory();
  const r = await handleCity(new Request(`http://localhost:8787${path}`), { backend: null, noCache: true, ASSETS });
  return r.text();
};
const block = (html) => (html.match(/<section class="city-notes">[\s\S]*?<\/section>/) || [""])[0];

test("Atlanta fibroid page carries its notes: where they work, the plan line, two tables, checked dates, the ask", async () => {
  const b = block(await get("/fibroids/doctors/atlanta-ga/"));
  assert.ok(b, "notes block present");
  assert.match(b, /<h2>Where these doctors work<\/h2>/);
  assert.match(b, /<h2>Insurance in Georgia<\/h2>/);
  assert.match(b, /Your plan may differ\. Employer self-funded plans and Medicare Advantage plans can set their own rules\. Check with your plan\./);
  assert.equal((b.match(/<table class="city-ins"/g) || []).length, 2);
  assert.match(b, /Checked November 7 to 8, 2026\./);
  assert.match(b, /Checked November 21, 2026\./);
  assert.match(b, /Ask the doctor&#39;s office to check with your plan before you book\./);
  assert.match(b, /href="\/fibroids\/insurance\/">See the conditions for each plan<\/a>/);
});

test("every plan row names its source with a link, and no row says covered without its conditions", async () => {
  const n = CITIES.notes.ufe["atlanta-ga"];
  for (const r of [...n.insurers, ...n.medicaid]) {
    assert.match(r.link, /^https:\/\//, r.name);
    if (/covered/i.test(r.says)) assert.match(r.says, /conditions/i, r.name);
  }
  const b = block(await get("/fibroids/doctors/atlanta-ga/"));
  assert.equal((b.match(/<th scope="row"><a href="https:\/\//g) || []).length, n.insurers.length + n.medicaid.length);
});

test("a city without notes shows no notes block", async () => {
  assert.equal(block(await get("/fibroids/doctors/chicago-il/")), "");
});
