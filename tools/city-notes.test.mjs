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
  assert.match(b, /<h2>Where these doctors are listed<\/h2>/);
  assert.match(b, /<h2>Insurance in Georgia<\/h2>/);
  assert.match(b, /Your plan may differ\. Employer self-funded plans and Medicare Advantage plans can set their own rules\. Check with your plan\./);
  assert.equal((b.match(/<table class="city-ins"/g) || []).length, 3);
  assert.match(b, /Checked November 7, 2026\./);
  assert.match(b, /Checked November 21, 2026\./);
  assert.match(b, /<ol class="city-steps"><li>Find your plan in the tables below\.<\/li>/);
  assert.match(b, /Ask the doctor&#39;s office to check with your plan before you book\./);
  assert.doesNotMatch(b, /myomectomy/i, "plain words");
  assert.match(b, /href="\/fibroids\/insurance\/">See the conditions for each plan<\/a>/);
  assert.match(b, /This section last reviewed November 21, 2026\./);
  assert.doesNotMatch(b, /\bwork(s|ing)?\b/, "listed, never practicing");
  assert.match(b, /Based on the Carelon guideline that Anthem plans appear to use\./, "Anthem row keeps its inference label");
  assert.match(b, /Five of the six national plans in the first table/, "summary tied to the table");
});

test("every plan row names its source with a link, and no row says covered without its conditions", async () => {
  const n = CITIES.notes.ufe["atlanta-ga"];
  for (const r of [...n.insurers, ...n.georgia, ...n.medicaid]) {
    assert.match(r.link, /^https:\/\//, r.name);
    if (/\bcovered\b/i.test(r.says) && !/^Not covered/i.test(r.says)) assert.match(r.says, /^Covered with conditions: \S/, r.name);
    assert.ok(r.policy, `${r.name}: names its policy`);
  }
  const b = block(await get("/fibroids/doctors/atlanta-ga/"));
  assert.equal((b.match(/<th scope="row"><a href="https:\/\//g) || []).length, n.insurers.length + n.georgia.length + n.medicaid.length);
});

test("a city without notes shows no notes block", async () => {
  assert.equal(block(await get("/fibroids/doctors/chicago-il/")), "");
});
