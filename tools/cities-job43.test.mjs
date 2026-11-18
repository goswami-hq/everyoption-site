// Job 43: four UFE doctors and four card phones on his word; Phoenix, Dallas-Fort Worth, St. Louis and Memphis pages.
// His words (2026-11-05 13:25 CT): "Yes" (ai-hq projects/platform/aeo/code-tab-prompt-job-43.md). node --test tools/cities-job43.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleCity, resetCities, metroList } from "../lib/cities.mjs";
import { resetDirectory } from "../lib/directory.mjs";
import { CITIES } from "../lib/cities-data.mjs";

const SITE = new URL("../site/", import.meta.url);
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const UFE = JSON.parse(read("data/ufe.json")).people;
const ROSTER = JSON.parse(read("data/ir-roster.json")).people;
const get = async (path) => {
  resetCities(); resetDirectory();
  const r = await handleCity(new Request(`http://localhost:8787${path}`), { backend: null, noCache: true, ASSETS });
  return { status: r.status, html: await r.text() };
};
const metro = (slug) => CITIES.metros.ufe.find((m) => m.slug === slug);
const DOCTORS = {   // npi: [name, metro, phone on the card ("" = none on his page)]
  "1437367042": ["William Fox", "houston-tx", "(713) 575-3686"],
  "1568416329": ["Chet Rees", "dallas-fort-worth-tx", "214-841-3004"],
  "1518345313": ["Kathleen Hibler", "dallas-fort-worth-tx", ""],
  "1306835020": ["Karen Garby", "phoenix-az", "(480) 863-9001"],
};
const PHONES = {
  "1487673448": ["Jonathan Levine", "chicago-il", "630-323-8690"],
  "1134388770": ["Saumil Shah", "chicago-il", "630-323-8690"],
  "1093780033": ["Murat Sor", "washington-dc", "571-500-8451"],
  "1073789749": ["Thomas Raggio", "washington-dc", "571-500-8451"],
};
const digits = (s) => s.replace(/\D/g, "");

test("15 city pages; the four new metros at or over the bar; Phoenix reaches it only through Garby", () => {
  const slugs = CITIES.metros.ufe.map((m) => m.slug);
  assert.equal(slugs.length, 15);
  for (const s of ["phoenix-az", "dallas-fort-worth-tx", "st-louis-mo", "memphis-tn"]) assert.ok(slugs.includes(s), s);
  const n = (s, ppl = UFE) => metroList(ppl, metro(s)).length;
  assert.deepEqual([n("phoenix-az"), n("dallas-fort-worth-tx"), n("st-louis-mo"), n("memphis-tn"), n("houston-tx")],
    [8, 11, 8, 8, 10]);   // Dallas-Fort Worth 12 to 11: Pauldeep Bahra off UFE (job platform-directory-0031, his "Yes" 2026-11-11)
  assert.equal(n("phoenix-az", UFE.filter((p) => p.npi !== "1306835020")), 7, "without Garby Phoenix is under the bar");
  assert.equal(metro("phoenix-az").centers.map((c) => c.zip).join(), "85004", "center not moved");
  assert.equal(metro("dallas-fort-worth-tx").centers.map((c) => c.zip).join(), "75201,76102");
});

test("the four doctors are on the UFE list, off the nearby list, and on their city pages with JS off", async () => {
  for (const [npi, [name, slug, phone]] of Object.entries(DOCTORS)) {
    const p = UFE.find((x) => x.npi === npi);
    assert.ok(p, name); assert.equal(p.name, name); assert.equal(p.phone, phone, name);
    assert.ok(!ROSTER.some((x) => x.npi === npi), `${name} not also in the nearby list`);
    const r = await get(`/fibroids/doctors/${slug}/`);
    assert.equal(r.status, 200);
    assert.ok(r.html.includes(`-${npi}/">`), `${name} on ${slug}`);
    if (phone) assert.ok(digits(r.html).includes(digits(phone)), `${name} phone on ${slug}`);
  }
});

test("the four phones are on their cards and their city pages; the other Jonathan Levine gets nothing", async () => {
  for (const [npi, [name, slug, phone]] of Object.entries(PHONES)) {
    const p = UFE.find((x) => x.npi === npi);
    assert.equal(p.name, name); assert.equal(p.phone, phone, name);
    const r = await get(`/fibroids/doctors/${slug}/`);
    const i = r.html.indexOf(`-${npi}/">`);
    assert.ok(i > 0, `${name} on ${slug}`);
    const card = r.html.slice(i, r.html.indexOf("</li>", i));
    assert.ok(digits(card).includes(digits(phone)), `${name} phone on the ${slug} card`);
  }
  assert.ok(!UFE.some((x) => x.npi === "1003806654"), "NPI 1003806654 (Houston namesake) not on the list");
});
