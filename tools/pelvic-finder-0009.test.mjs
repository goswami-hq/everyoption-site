// Job platform-directory-0009 (his go 2026-11-07: "Yes to both changes and the builder"): the pelvic vein finder on
// /chronic-pelvic-pain/, its home dropdown entry, the procedure tag on profiles, and four pelvic city pages, all noindex
// and out of the sitemap while the pelvic page is a draft. node --test tools/pelvic-finder-0009.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { handleCity, resetCities } from "../lib/cities.mjs";
import { handleDoctor, resetDirectory } from "../lib/directory.mjs";
import { CITIES } from "../lib/cities-data.mjs";
import { PROCS, PROC_LONG, DRAFT_PROCS } from "../lib/procedures.mjs";

const SITE = new URL("../site/", import.meta.url);
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const env = { backend: null, noCache: true, ASSETS };
const city = async (path) => { resetCities(); resetDirectory(); const r = await handleCity(new Request(`http://localhost${path}`), env); return { status: r.status, html: await r.text() }; };
const doctor = async (path) => { resetDirectory(); const r = await handleDoctor(new Request(`http://localhost${path}`), env); return { status: r.status, html: await r.text() }; };
const PELVIC = JSON.parse(read("data/pelvic.json"));
const DIR = JSON.parse(read("data/directory.json")).people;
const SLUGS = ["new-york-city-area", "washington-dc", "philadelphia-pa", "baltimore-md"];
const sitemaps = () => readdirSync(SITE).filter((f) => /^sitemap.*\.xml$/.test(f)).map((f) => read(f)).join("\n");

test("pelvic is one more procedure, plain words, marked draft", () => {
  assert.deepEqual(PROCS, ["ufe", "pae", "gae", "pelvic"]);
  assert.equal(PROC_LONG.pelvic, "Pelvic vein treatment");
  assert.deepEqual(DRAFT_PROCS, ["pelvic"]);
  assert.equal(PELVIC.procedure, "pelvic");
  assert.ok(PELVIC.people.length >= 100, "the exported list");
  for (const p of PELVIC.people) { assert.ok(!("grade" in p) && !("evidence" in p), "no grades or quotes published"); }
  assert.ok(!PELVIC.people.some((p) => p.npi === "1023058641"), "Brian Schwartz is off (his word 2026-11-07)");
  const politi = PELVIC.people.find((p) => p.npi === "1508067745");
  assert.deepEqual([politi.city, politi.state], ["Meriden", "CT"], "Politi in central Connecticut (his word 2026-11-07)");
});

test("the pelvic page has the ZIP finder, keeps its intro, links the city pages, and stays noindex", () => {
  const page = read("chronic-pelvic-pain/index.html");
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(page, /<div id="finder" data-procedure="pelvic" data-learn="#options">/);
  assert.match(page, /<p class="lede">Long-term pelvic pain can have many causes\./, "the page's own intro stays");
  assert.match(page, /Pelvic vein treatments are done through a tiny skin nick, without surgery\. Nothing is cut out of your body\.<\/p>\n<p class="find-links"><a href="#embolization">How it works<\/a><\/p>/);
  assert.match(page, /<a class="btn" href="#finder">Find a doctor for pelvic vein treatment<\/a>/);
  assert.match(page, /Enter your ZIP code to see doctors near you, nearest first\./);
  for (const s of SLUGS) assert.ok(page.includes(`href="/chronic-pelvic-pain/doctors/${s}/"`), s);
  assert.ok(page.includes('href="/chronic-pelvic-pain/doctors/"'), "the city list");
  assert.ok(!sitemaps().includes("/chronic-pelvic-pain/"), "out of the sitemap");
});

test("the finder script shows the same Confirmed by physician box for any procedure", () => {
  const js = read("assets/finder.js");
  assert.match(js, /Confirmed by physician: 0 nearby\./);
  assert.match(js, /"\/account\/\?procedure=" \+ encodeURIComponent\(PROC\)/);
});

test("home: the condition card opens the finder with its count, and the ZIP dropdown offers it", () => {
  const home = read("index.html");
  assert.match(home, new RegExp(`<li class="t-cpp"><a href="/chronic-pelvic-pain/"><strong>Chronic pelvic pain</strong><span class="proc">Pelvic vein treatment</span><span class="count">${PELVIC.people.length} doctors listed</span>`));
  const opts = [...home.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(opts.at(-1), ["/chronic-pelvic-pain/", "Chronic pelvic pain"]);
  assert.equal(opts.length, 4);
  assert.doesNotMatch(home, /Doctor list coming/);
});

test("the first four pelvic city pages stay, by the bar of 8 within 25 miles, each noindex with the 0 confirmed box", async () => {
  // The four first pages stay; more cities join as they reach the bar (counts not frozen, his words 2026-11-10).
  for (const s of SLUGS) assert.ok(CITIES.metros.pelvic.some((m) => m.slug === s), s);
  assert.ok(CITIES.draft.includes("pelvic"));
  const hub = await city("/chronic-pelvic-pain/doctors/");
  assert.equal(hub.status, 200);
  assert.match(hub.html, /<h1>Where can I get pelvic vein treatment\?<\/h1>/);
  assert.match(hub.html, /<meta name="robots" content="noindex">/);
  for (const s of SLUGS) {
    const { status, html } = await city(`/chronic-pelvic-pain/doctors/${s}/`);
    assert.equal(status, 200, s);
    assert.match(html, /<meta name="robots" content="noindex">/, s);
    assert.match(html, /<h1>Who does pelvic vein treatment near [^<]+\?<\/h1>/, s);
    assert.match(html, /Confirmed by physician: 0 nearby\./, s);
    assert.match(html, /href="\/account\/\?procedure=pelvic"/, s);
    assert.match(html, /<a href="\/chronic-pelvic-pain\/">Read about your chronic pelvic pain treatment options<\/a>/, s);
    assert.ok((html.match(/class="card/g) || []).length >= 8, `${s}: at least 8 cards`);
    assert.doesNotMatch(html, /\(pelvic vein treatment\)|\(\)/, `${s}: no empty or doubled abbreviation`);
    assert.doesNotMatch(html, /Schwartz/, s);
  }
});

test("other city pages link to the pelvic page for the same metro; pelvic pages link back", async () => {
  const ufe = await city("/fibroids/doctors/new-york-city-area/");
  assert.match(ufe.html, /<a href="\/chronic-pelvic-pain\/doctors\/new-york-city-area\/">\d+ doctors near New York City are listed for pelvic vein treatment<\/a>/);
  const pel = await city("/chronic-pelvic-pain/doctors/new-york-city-area/");
  assert.match(pel.html, /<a href="\/fibroids\/doctors\/new-york-city-area\/">/);
});

test("profiles: the pelvic tag links the pelvic page; a pelvic-only profile stays noindex and out of the sitemap", async () => {
  const both = DIR.find((p) => p.l.split(" ").includes("pelvic") && p.l.split(" ").includes("ufe"));
  const b = await doctor(both.p);
  assert.equal(b.status, 200);
  assert.match(b.html, /<a href="\/chronic-pelvic-pain\/">Pelvic vein treatment<\/a>/);
  assert.doesNotMatch(b.html, /name="robots"/, "indexed for its UFE listing");
  const only = DIR.find((p) => p.l === "pelvic");
  const o = await doctor(only.p);
  assert.equal(o.status, 200);
  assert.match(o.html, /Likely performs:[\s\S]*<a href="\/chronic-pelvic-pain\/">Pelvic vein treatment<\/a>/);
  assert.match(o.html, /<meta name="robots" content="noindex">/);
  assert.ok(!sitemaps().includes(only.p), "pelvic-only profile out of the sitemap");
  assert.ok(sitemaps().includes(both.p));
  const nyc = PELVIC.people.find((p) => CITIES.metro_of.pelvic[p.npi] === "new-york-city-area");
  const rec = DIR.find((p) => p.p.endsWith(`-${nyc.npi}/`));
  assert.match((await doctor(rec.p)).html, /<a href="\/chronic-pelvic-pain\/doctors\/new-york-city-area\/">Other pelvic vein treatment doctors near New York City<\/a>/);
});

test("profile search knows the pelvic list (live removals apply to it too)", () => {
  const js = read("assets/directory.js");
  assert.match(js, /var PROCS = \["ufe", "pae", "gae", "pelvic"\]/);
  assert.ok(DIR.some((p) => p.l.split(" ").includes("pelvic")));
});
