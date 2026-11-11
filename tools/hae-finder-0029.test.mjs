// Job platform-directory-0029 (his go 2026-11-11: "Yes start the export"): the HAE finder on /hemorrhoids/, its home card
// with a count and ZIP dropdown entry, the procedure tag on profiles, and the New York City HAE city page, all noindex
// and out of the sitemap while the hemorrhoid page is a draft. node --test tools/hae-finder-0029.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { handleCity, resetCities } from "../lib/cities.mjs";
import { handleDoctor, resetDirectory } from "../lib/directory.mjs";
import { CITIES } from "../lib/cities-data.mjs";
import { PROCS, PROC_LONG, PROC_SHORT, DRAFT_PROCS } from "../lib/procedures.mjs";

const SITE = new URL("../site/", import.meta.url);
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const env = { backend: null, noCache: true, ASSETS };
const city = async (path) => { resetCities(); resetDirectory(); const r = await handleCity(new Request(`http://localhost${path}`), env); return { status: r.status, html: await r.text() }; };
const doctor = async (path) => { resetDirectory(); const r = await handleDoctor(new Request(`http://localhost${path}`), env); return { status: r.status, html: await r.text() }; };
const HAE = JSON.parse(read("data/hae.json"));
const DIR = JSON.parse(read("data/directory.json")).people;
const sitemaps = () => readdirSync(SITE).filter((f) => /^sitemap.*\.xml$/.test(f)).map((f) => read(f)).join("\n");

test("HAE is one more procedure, marked draft, with no grades or quotes published", () => {
  assert.deepEqual(PROCS, ["ufe", "pae", "gae", "pelvic", "hae"]);
  assert.equal(PROC_LONG.hae, "Hemorrhoid artery embolization (HAE)");
  assert.equal(PROC_SHORT.hae, "HAE");
  assert.ok(DRAFT_PROCS.includes("hae"));
  assert.equal(HAE.procedure, "hae");
  assert.ok(HAE.people.length >= 40, "the exported list");
  for (const p of HAE.people) {
    assert.ok(!("grade" in p) && !("evidence" in p), "no grades or quotes published");
    assert.ok(!/covered/i.test(JSON.stringify(p)), "market requirement 5: no covered-by-insurance claim on a card");
  }
  assert.ok(HAE.people.some((p) => p.npi === "1679647267"), "Ferris stays on HAE: his own expertise line names it (job 0029 stage 1)");
});

test("the hemorrhoid page has the ZIP finder, its button in the lead option, keeps its text, and stays noindex", () => {
  const page = read("hemorrhoids/index.html");
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(page, /<div id="finder" data-procedure="hae" data-learn="#options">/);
  assert.match(page, /<p class="lede">Rectal bleeding always needs a doctor&#x27;s check first/, "the page's own intro stays, first paragraph");
  assert.equal((page.match(/<p class="lede">/g) || []).length >= 2, true, "the intro's two paragraphs stay two");
  assert.match(page, /Hemorrhoid embolization treats bleeding hemorrhoids without surgery, through a tiny skin nick in the wrist or groin\.<\/p>\n<p class="find-links"><a href="#embolization">How it works<\/a><a class="find-compare" href="\/hemorrhoids\/every-option\/">Compare your options<\/a><\/p>/);
  assert.match(page, /<section class="lead-option" id="embolization">[\s\S]*?<a class="btn" href="#finder">Find a doctor for hemorrhoid embolization<\/a>/);
  assert.match(page, /or contact one of the doctors listed on our site\./, "the FAQ line stays (his words 2026-11-10: \"Just leave it\")");
  assert.match(page, /data-replay/, "the animation stays");
  assert.ok(page.includes('href="/hemorrhoids/doctors/new-york-city-area/"'));
  assert.ok(page.includes('href="/hemorrhoids/doctors/"'), "the city list");
  assert.ok(!sitemaps().includes("/hemorrhoids/"), "out of the sitemap");
  assert.doesNotMatch(page, /Covered by insurance/i);
});

test("home: Bleeding hemorrhoids is a normal row with its count, and the ZIP dropdown offers it", () => {
  const home = read("index.html");
  assert.match(home, new RegExp(`<li class="t-hem"><a href="/hemorrhoids/"[^>]*><strong>Bleeding hemorrhoids</strong><span class="proc">Hemorrhoid artery embolization \\(HAE\\)</span><span class="count">${HAE.people.length} doctors listed</span>`));
  assert.doesNotMatch(home, /Doctor list coming/);
  const opts = [...home.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(opts.at(-1), ["/hemorrhoids/", "Bleeding hemorrhoids"]);
  assert.equal((home.match(/class="t-hem"/g) || []).length, 1, "one hemorrhoid card");
});

test("404 and profile search know HAE", () => {
  const nf = read("404.html");
  assert.ok(nf.includes('href="/hemorrhoids/"'));
  assert.doesNotMatch(nf, /doctor list coming/i);
  assert.match(read("assets/directory.js"), /var PROCS = \["ufe", "pae", "gae", "pelvic", "hae"\]/);
  assert.match(read("_redirects"), /^\/hae\/? \/hemorrhoids\/ 301$/m);
});

test("the New York City HAE page: bar of 8 within 25 miles, noindex, the 0 confirmed box", async () => {
  assert.deepEqual(CITIES.metros.hae.map((m) => m.slug), ["new-york-city-area"]);
  assert.ok(CITIES.draft.includes("hae"));
  const hub = await city("/hemorrhoids/doctors/");
  assert.equal(hub.status, 200);
  assert.match(hub.html, /<meta name="robots" content="noindex">/);
  const { status, html } = await city("/hemorrhoids/doctors/new-york-city-area/");
  assert.equal(status, 200);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /Confirmed by physician: 0 nearby\./);
  assert.match(html, /href="\/account\/\?procedure=hae"/);
  assert.ok((html.match(/class="card/g) || []).length >= 8, "at least 8 cards");
  assert.doesNotMatch(html, /\(HAE\) \(HAE\)|\(\)/);
});

test("profiles: the HAE tag links the hemorrhoid page; an HAE-only profile stays noindex and out of the sitemap", async () => {
  const both = DIR.find((p) => (p.l || "").split(" ").includes("hae") && (p.l || "").split(" ").includes("ufe"));
  const b = await doctor(both.p);
  assert.equal(b.status, 200);
  assert.match(b.html, /<a href="\/hemorrhoids\/">[^<]*HAE[^<]*<\/a>/);
  const only = DIR.find((p) => p.l === "hae");
  const o = await doctor(only.p);
  assert.equal(o.status, 200);
  assert.match(o.html, /<a href="\/hemorrhoids\/">[^<]*HAE[^<]*<\/a>/);
  assert.match(o.html, /<meta name="robots" content="noindex">/);
  assert.ok(!sitemaps().includes(only.p), "HAE-only profile out of the sitemap");
});
