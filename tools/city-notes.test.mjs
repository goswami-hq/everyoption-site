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
const block = (html) => (html.match(/<section class="city-notes[^"]*">[\s\S]*?<\/section>/g) || []).join("\n");

test("Atlanta fibroid page carries its notes: where they work, the plan line, two tables, checked dates, the ask", async () => {
  const b = block(await get("/fibroids/doctors/atlanta-ga/"));
  assert.ok(b, "notes block present");
  assert.match(b, /<h2>Where these doctors are listed<\/h2>/);
  assert.match(b, /<h2 id="insurance">Insurance in Georgia<\/h2>/);
  assert.match(b, /Your plan may differ\. Employer self-funded plans and Medicare Advantage plans can set their own rules\. Check with your plan\./);
  assert.equal((b.match(/<table class="city-ins"/g) || []).length, 3);
  assert.match(b, /Checked November 7, 2026\./);
  assert.match(b, /Checked November 21, 2026\./);
  assert.match(b, /<ol class="city-steps"><li>Find your plan in the groups below\.<\/li>/);
  assert.match(b, /Ask the doctor&#39;s office to check with your plan before you book\./);
  assert.doesNotMatch(b, /myomectomy/i, "plain words");
  assert.match(b, /href="\/fibroids\/insurance\/">See the conditions for each plan<\/a>/);
  assert.match(b, /This section last reviewed November 21, 2026\./);
  assert.doesNotMatch(b, /\bwork(s|ing)?\b/, "listed, never practicing");
  assert.match(b, /Approval needed; Carelon reviews it\. Applies to fully insured plans and to employer plans that bought this program\./, "Anthem row keeps its scope");
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

// his words 2026-11-21: insurance was "at the bottom of endless scrolling past so many different doctor names"
test("Atlanta: insurance sits above the doctor list, plan tables folded, jump row links each section", async () => {
  const html = await get("/fibroids/doctors/atlanta-ga/");
  const ins = html.indexOf('<h2 id="insurance">'), docs = html.indexOf('<h2 id="doctors">'), firstCard = html.indexOf('class="cards"');
  assert.ok(ins > 0 && ins < docs && docs < firstCard, "insurance, then the doctors heading, then the cards");
  assert.match(html, /<nav class="on-page" aria-label="On this page"><span class="k">On this page:<\/span> <a href="#insurance">Insurance in Georgia<\/a> <a href="#doctors">\d+ doctors<\/a>/);
  assert.ok(html.indexOf('<nav class="on-page"') < ins, "jump row first");
  for (const id of ["insurance", "doctors"]) assert.match(html, new RegExp(`id="${id}"`));
  if (/href="#nearby"/.test(html)) assert.match(html, /<h2 id="nearby">/);
  assert.equal((html.match(/<details class="ins-fold"><summary>/g) || []).length, 3, "three closed plan tables");
  assert.doesNotMatch(html, /<details class="ins-fold" open/, "closed by default");
  assert.ok(html.indexOf("<h2>Where these doctors are listed</h2>") > firstCard, "where they are listed stays below the cards");
  const chi = await get("/fibroids/doctors/chicago-il/");
  assert.doesNotMatch(chi, /class="on-page"|id="insurance"/, "a city with no notes is unchanged");
  assert.match(chi, /<p class="cov-link">[\s\S]*<h2 id="doctors">/, "a city with no notes keeps its coverage link above the list");
  assert.match(html, /Georgia Medicaid <span class="muted">\(3&nbsp;plans and the state program\)<\/span>/);
  assert.match(html, /<summary><span>Other Georgia plans <span class="muted">\(4&nbsp;plans\)/, "no approval claim in the group title");
});
