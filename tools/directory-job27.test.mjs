// Job 27: public doctor directory. node --test tools/directory-job27.test.mjs
// His words (2026-11-03): "only groups A B C, nobody else"; "a way to be found via SEO and LLMs".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { world, ANN, EMAIL } from "./accounts-helpers.mjs";
import { handleDoctor, mergeDoctor, render, slug, resetDirectory } from "../lib/directory.mjs";

const SITE = new URL("../site/", import.meta.url), TOOLS = new URL("./", import.meta.url).pathname;
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const DIR = JSON.parse(read("data/directory.json"));
// Job platform-directory-0009: a profile is indexed for its non-draft procedures only (content/procedures.json stage
// "listed", which was "draft" before job platform-directory-0032).
const DRAFT = JSON.parse(readFileSync(new URL("../content/procedures.json", import.meta.url), "utf8")).filter((p) => p.stage === "listed").map((p) => p.key);
const INDEXED = (p) => (p.l || "").split(" ").filter((k) => k && !DRAFT.includes(k)).length > 0;
const npiOf = (x) => x.p.slice(-11, -1);
// pelvic added 2026-11-10: the pelvic finder (job pelvic-finder-0009) shows its own list, so the directory holds those doctors too.
const LISTS = Object.fromEntries(["ufe", "pae", "gae", "pelvic"].map((k) => [k, JSON.parse(read(`data/${k}.json`)).people]));
const ROSTER = JSON.parse(read("data/ir-roster.json")).people;

// The finder's own functions, taken from site/assets/finder.js as written.
const FINDER = read("assets/finder.js");
function grab(name) {
  const i = FINDER.indexOf(`function ${name}(`);
  let depth = 0, j = FINDER.indexOf("{", i);
  for (; j < FINDER.length; j++) { if (FINDER[j] === "{") depth++; if (FINDER[j] === "}" && --depth === 0) break; }
  return FINDER.slice(i, j + 1);
}
const finder = new Function(`${grab("miles")}\n${grab("place")}\n${grab("rosterShown")}\nreturn { place, rosterShown };`)();
function finderShows(lists, roster) {
  const s = new Set();
  for (const people of Object.values(lists)) for (const p of people) if (!p.test && finder.place(p, [p.lat ?? 0, p.lon ?? 0], Infinity)) s.add(p.npi);
  for (const p of roster) if (finder.rosterShown(p)) s.add(p.npi);
  return s;
}
function pyMembers(lists, roster) {
  const out = execFileSync("python3", ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import directory
d = json.load(sys.stdin); print(json.dumps(directory.members(d["lists"], d["roster"])))`], { input: JSON.stringify({ lists, roster }) });
  return JSON.parse(out);
}
const get = async (path, env = {}, host = "localhost:8787") => {
  resetDirectory();
  const r = await handleDoctor(new Request(`http://${host}${path}`), { backend: null, noCache: true, ASSETS, ...env });
  return r && { status: r.status, html: await r.text(), h: r.headers };
};

test("membership: the directory holds exactly who the finder can show, on the real data", () => {
  const want = finderShows(LISTS, ROSTER);
  const got = new Set(DIR.people.map(npiOf));
  assert.deepEqual([...got].filter((n) => !want.has(n)), [], "in the directory but not shown by the finder");
  assert.deepEqual([...want].filter((n) => !got.has(n)), [], "shown by the finder but missing from the directory");
  assert.ok(got.size > 2600, `count ${got.size}`);
});

test("membership: every filter exclusion, finder and directory agree on made-up rows", () => {
  const base = { proven: true, billing_only: false, neuro_only: false, phone: "312-555-0100", url: "", lat: 41.9, lon: -87.6, city: "Chicago", state: "IL" };
  const roster = [
    { ...base, npi: "1000000001", name: "Ok Roster" },
    { ...base, npi: "1000000002", name: "Billing Only", billing_only: true },
    { ...base, npi: "1000000003", name: "Neuro Only", neuro_only: true },
    { ...base, npi: "1000000004", name: "Not Proven", proven: false },
    { ...base, npi: "1000000005", name: "No Contact", phone: "", url: "" },
    { ...base, npi: "1000000006", name: "No Place", lat: null },
    { ...base, npi: "1000000007", name: "Url Only", phone: "", url: "https://x.example/" },
  ];
  const lists = { ufe: [
    { npi: "1000000011", name: "Listed Doc", lat: 41.9, lon: -87.6, city: "Chicago", state: "IL" },
    { npi: "1000000012", name: "Listed Unplaced", lat: null, lon: null, city: "Nowhere", state: "IL" },
    { npi: "1000000013", name: "Office Placed", lat: null, lon: null, offices: [{ city: "Chicago", state: "IL", lat: 41.8, lon: -87.6 }] },
    { npi: "1999999990", name: "Sample Doctor, MD (test listing)", lat: 41.9, lon: -87.6, test: true },
  ], pae: [], gae: [] };
  const py = new Set(Object.keys(pyMembers(lists, roster)));
  assert.deepEqual([...py].sort(), [...finderShows(lists, roster)].sort());
  assert.deepEqual([...py].sort(), ["1000000001", "1000000007", "1000000011", "1000000013"]);
});

test("allow-list: the public files carry public fields only", () => {
  for (const p of DIR.people) for (const k of Object.keys(p)) assert.ok(["n", "c", "s", "p", "l", "r"].includes(k), k);
  const ok = new Set(["name", "practice", "city", "state", "phone", "url", "offices", "insurances", "insurance_other", "insurance_confirm",
    "booking_url", "photo", "blurbs", "procs", "roster"]);
  for (const f of readdirSync(new URL("data/doctors/", SITE))) {
    for (const [npi, r] of Object.entries(JSON.parse(read(`data/doctors/${f}`)))) {
      assert.match(npi, /^\d{10}$/); assert.equal(npi.slice(-2) + ".json", f);
      for (const k of Object.keys(r)) assert.ok(ok.has(k), `${npi} ${k}`);
      for (const o of r.offices || []) for (const k of Object.keys(o)) assert.ok(["practice", "street", "city", "state", "zip", "phone"].includes(k), k);
    }
  }
  const text = JSON.stringify(DIR) + readdirSync(new URL("data/doctors/", SITE)).map((f) => read(`data/doctors/${f}`)).join("");
  for (const bad of ["city_label", "site_names", "billing_only", "neuro_only", "proven", "email", "evidence", "grade", "quote"]) assert.ok(!text.includes(`"${bad}"`), bad);
});

test("test profile and his NPI are absent from every generated directory file", () => {
  const files = ["data/directory.json", "sitemap.xml", "doctors/index.html", ...readdirSync(new URL("data/doctors/", SITE)).map((f) => `data/doctors/${f}`),
    ...readdirSync(new URL("doctors/", SITE)).filter((d) => d.length <= 5 && d !== "index.html").map((d) => `doctors/${d}/index.html`)];
  const all = files.map(read).join("\n");
  assert.ok(!all.includes("1999999990") && !/test listing/i.test(all), "test profile");
  // His NPI is kept out of this repo; it is read from the ai-hq checkout on the mini when present.
  const live = os.homedir() + "/ai-hq/scripts/every_option_live_test.py";
  const his = existsSync(live) && /^DOCTOR = \{[^\n]*"npi": "(\d{10})"/m.exec(readFileSync(live, "utf8"));
  if (his) assert.ok(!all.includes(his[1]), "his NPI"); else console.log("note: ai-hq checkout not found; his-NPI check skipped");
});

// Job platform-web-design-0008: the finder and the search page no longer have their own slug(); they read the address
// from the data (tools/profile-links.test.mjs). Python and the server still agree here.
test("slug: Python and server agree on every name and on hard ones", () => {
  const hard = ["Paul O'Connor", "Ana-María Núñez", "José  Pérez Jr.", "Zoë D’Othee", "Émile Brontë-Smith", "  ", "Łukasz Ćwik"];
  const names = [...new Set([...DIR.people.map((p) => p.n), ...hard])];
  const py = JSON.parse(execFileSync("python3", ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import directory
print(json.dumps([directory.slug(n) for n in json.load(sys.stdin)]))`], { input: JSON.stringify(names) }));
  names.forEach((n, i) => assert.equal(slug(n), py[i], n));
  assert.equal(slug("Paul O'Connor"), "paul-oconnor"); assert.equal(slug("Ana-María Núñez"), "ana-maria-nunez");
  for (const p of DIR.people) assert.equal(p.p, `/doctors/${slug(p.n)}-${npiOf(p)}/`);
});

const LIKELY = DIR.people.find((p) => p.l), NEARBY = DIR.people.find((p) => !p.l);

test("profile: 200 with full HTML, canonical, JSON-LD, and the finder's wording", async () => {
  for (const x of [LIKELY, NEARBY]) {
    const r = await get(x.p);
    assert.equal(r.status, 200);
    assert.match(r.h.get("Content-Type"), /text\/html/); assert.match(r.h.get("Cache-Control"), /max-age=60/);
    assert.ok(r.html.includes(`<link rel="canonical" href="https://everyoptionmd.com${x.p}">`));
    assert.ok(r.html.includes("Details not confirmed by this doctor. Check with the office before you go."));
    assert.ok(r.html.includes("Is this you?") && r.html.includes("Report an error"));
    assert.ok(r.html.includes("Education, not medical advice.") && r.html.includes("no one can pay"));
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(r.html)[1]);
    assert.equal(ld["@type"], "Person"); assert.equal(ld.jobTitle, "Interventional radiologist");
    assert.equal(ld.knowsAbout, undefined, "a Likely or nearby doctor is never marked as performing a procedure");
    assert.equal(ld.workLocation[0]["@type"], "Place");
    assert.doesNotMatch(r.html, /Confirmed by physician/);
  }
  assert.match((await get(LIKELY.p)).html, /Likely performs:/);
  // His yes 2026-11-04 (job 32): a Likely profile carries only the one "Details not confirmed" line.
  assert.doesNotMatch((await get(LIKELY.p)).html, /Based on public information online/);
  assert.match((await get(NEARBY.p)).html, /We don't yet know which procedures this doctor performs\. Call and ask about:/);
});

test("identical qualifiers: every Likely profile and every nearby profile says the same words", async () => {
  const strip = (h) => /<h2>Procedures<\/h2>([\s\S]*?)<h2>/.exec(h)[1].replace(/<a href="[^"]*">[^<]*<\/a>/g, "L");
  const one = (l) => DIR.people.filter((p) => p.l === l).slice(0, 8);
  for (const group of [one("ufe"), one("pae gae"), DIR.people.filter((p) => !p.l).slice(0, 8)]) {
    const seen = new Set();
    for (const p of group) seen.add(strip((await get(p.p)).html));
    assert.equal(seen.size, 1, [...seen].join("\n---\n"));
  }
});

test("addresses: wrong slug and bare NPI redirect; unknown, test, and never-shown NPIs are 404", async () => {
  const npi = npiOf(LIKELY);
  for (const bad of [`/doctors/wrong-name-${npi}/`, `/doctors/${npi}/`, LIKELY.p.slice(0, -1)]) {
    const r = await get(bad); assert.equal(r.status, 301, bad); assert.equal(r.h.get("Location"), LIKELY.p);
  }
  assert.equal((await get("/doctors/nobody-1234567893/")).status, 404);
  assert.equal((await get("/doctors/sample-doctor-1999999990/")).status, 404);
  // Job 30: the roster now holds only shown people, so the never-shown are the unplaced list people (name only).
  const hidden = Object.values(LISTS).flat().filter((p) => !DIR.people.some((x) => npiOf(x) === p.npi));
  assert.ok(hidden.length >= 1);
  assert.deepEqual(ROSTER.filter((p) => !finder.rosterShown(p)), []);
  for (const p of hidden.slice(0, 40)) assert.equal((await get(`/doctors/${slug(p.name)}-${p.npi}/`)).status, 404, p.npi);
  assert.equal(await get("/doctors/"), null, "search page is static"); assert.equal(await get("/doctors/a/"), null);
});

test("noindex on preview and local hosts only", async () => {
  assert.equal((await get(LIKELY.p)).h.get("X-Robots-Tag"), "noindex");
  assert.equal((await get(LIKELY.p, {}, "every-option-job-5.everyoption-site.pages.dev")).h.get("X-Robots-Tag"), "noindex");
  assert.equal((await get(LIKELY.p, {}, "everyoptionmd.com")).h.get("X-Robots-Tag"), null);
});

// The overlay, from rows shaped like the database's (lib/accounts/listings.mjs overlayFor).
const row = (npi, name, level, attested, held, extra = {}) => ({ npi, attested, held, account: { npi, level, name }, offices: [
  { practice: "Lakeside IR", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100", geo: "address", lat: 41.89, lon: -87.62 }],
  insurances: [], blurbs: {}, ...extra });
const db = (rows) => ({ data: { overlay: async () => rows } });

test("overlay: removal follows the finder; a removed procedure leaves, the profile leaves only when no group is left", async () => {
  const two = DIR.people.find((p) => p.l === "pae gae"), npi = npiOf(two);
  let r = await get(two.p, { backend: db([row(npi, two.n, "partial", ["pae"], ["pae", "gae"])]) });
  assert.equal(r.status, 200);
  assert.match(r.html, /Prostate artery embolization/); assert.doesNotMatch(r.html, /Genicular artery embolization \(GAE\)<\/a><br>/);
  r = await get(two.p, { backend: db([row(npi, two.n, "partial", [], ["pae", "gae"])]) });
  assert.equal(r.status, 404, "off every list and not on the nearby roster");
});

test("overlay: a new account doctor gets a profile; partial is Likely, full is Confirmed with photo", async () => {
  const npi = "1999000098", name = "Newa Accountdoc";
  const partial = db([row(npi, name, "partial", ["ufe"], ["ufe"], { blurbs: { ufe: "Same-week visits." }, photo_key: `${npi}/abcdef0123456789.png` })]);
  let r = await get(`/doctors/newa-accountdoc-${npi}/`, { backend: partial });
  assert.equal(r.status, 200);
  assert.match(r.html, /Likely performs:/); assert.match(r.html, /Same-week visits\./);
  assert.doesNotMatch(r.html, /class="photo"/, "no photo on partial");
  assert.match(r.html, /100 Test Plaza, Chicago, IL 60611/);
  const full = db([row(npi, name, "full", ["ufe"], ["ufe"], { photo_key: `${npi}/abcdef0123456789.png` })]);
  r = await get(`/doctors/newa-accountdoc-${npi}/`, { backend: full });
  assert.match(r.html, /Confirmed by physician/); assert.match(r.html, /class="photo" src="\/api\/photo\/1999000098-abcdef0123456789\.png"/);
  assert.doesNotMatch(r.html, /Details not confirmed by this doctor\. Check with the office before you go\./); assert.doesNotMatch(r.html, /Is this you\?/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(r.html)[1]);
  assert.equal(ld.knowsAbout[0].name, "Uterine fibroid embolization (UFE)");
  const noOffice = db([row(npi, name, "partial", ["ufe"], ["ufe"], { offices: [] })]);
  assert.equal((await get(`/doctors/newa-accountdoc-${npi}/`, { backend: noOffice })).status, 404, "no place on the map: the finder cannot show them");
});

test("database down or slow: the static profile is served; an account-only doctor gets 503, not 404", async () => {
  const down = { data: { overlay: async () => { throw new Error("down"); } } };
  assert.equal((await get(LIKELY.p, { backend: down })).status, 200);
  const slow = { data: { overlay: () => new Promise((ok) => setTimeout(() => ok([]), 300)) } };
  assert.equal((await get(LIKELY.p, { backend: slow, listingsTimeoutMs: 50 })).status, 200);
  const r = await get("/doctors/x-1999000098/", { backend: down });
  assert.equal(r.status, 503); assert.equal(r.h.get("Cache-Control"), "no-store");
});

test("escaping: every field in HTML and JSON-LD", () => {
  const evil = `<script>alert(1)</script>"'&`;
  const p = mergeDoctor("1999000098", null, { ufe: { removed: [], people: [{ npi: "1999000098", name: evil, confirmed: true, offices: [
    { practice: evil, street: evil, city: evil, state: "IL", zip: "60611", phone: evil, lat: 41, lon: -87 }], booking_url: "javascript:alert(1)",
    insurances: [evil], insurance_other: evil, insurance_confirm: true, blurb: evil, photo: "" }] } });
  const html = render("1999000098", p);
  assert.ok(!html.includes("<script>alert"), "no raw script");
  assert.ok(!html.includes("javascript:"), "unsafe link dropped");
  const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1];
  assert.ok(!/[<>]/.test(ld)); assert.equal(JSON.parse(ld).name, evil);
});

test("live flow through the accounts stand-ins: sign up, attest, profile, withdraw, gone", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  await c.put("profile", { offices: [{ practice: "Lakeside IR", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" }] });
  const path = `/doctors/ann-testone-${ANN}/`;
  assert.equal((await get(path, { backend: w.backend })).status, 200);
  await c.post("withdraw", { procedure: "ufe" });
  assert.equal((await get(path, { backend: w.backend })).status, 404);
});

test("sitemap and robots: every indexed profile once, AI crawlers allowed, search and A to Z pages present", () => {
  // Job 42: the sitemap is an index of one file per page type; doctors are in sitemap-doctors.xml.
  assert.match(read("sitemap.xml"), /<sitemapindex[\s\S]*sitemap-doctors\.xml/);
  const sm = read("sitemap-doctors.xml"), locs = [...sm.matchAll(/<loc>https:\/\/everyoptionmd\.com(\/doctors\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  const profiles = locs.filter((u) => /-\d{10}\/$/.test(u));
  assert.equal(new Set(profiles).size, profiles.length, "each once");
  assert.deepEqual([...profiles].sort(), DIR.people.filter(INDEXED).map((p) => p.p).sort(), "launch setting (job 42): listed doctors only, no nearby; a draft procedure alone does not index (job 0009)");
  assert.ok(read("sitemap-pages.xml").includes("https://everyoptionmd.com/doctors/<") && locs.includes("/doctors/a/"));
  const robots = read("robots.txt");
  for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot"]) assert.match(robots, new RegExp(`User-agent: ${bot}\\nAllow: /`));
  const routes = JSON.parse(read("_routes.json"));
  assert.ok(routes.include.includes("/doctors/*") && routes.exclude.includes("/doctors/") && routes.exclude.includes("/doctors/a/"));
  assert.ok(routes.include.length + routes.exclude.length <= 100, "Cloudflare allows 100 rules");
});

test("search page: no search text leaves the page", () => {
  const js = read("assets/directory.js");
  const fetches = [...js.matchAll(/fetch\(([^,)]*)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['"/api/listings?procedure=" + proc', '"/data/directory.json"']);
  assert.doesNotMatch(js, /localStorage|sessionStorage|cookie|history\.|sendBeacon/);
});

test("index setting: one setting by group drives the sitemap and the profile's robots tag", async () => {
  const setting = JSON.parse(readFileSync(new URL("../content/directory.json", import.meta.url), "utf8")).index;
  const { INDEX } = await import("../lib/directory-shell.mjs");
  assert.deepEqual(INDEX, setting, "the server copy matches content/directory.json (rebuild after a change)");
  assert.deepEqual(setting, { confirmed: true, likely: true, nearby: false }, "launch (his yes 2026-11-05): nearby held back");
  const out = JSON.parse(execFileSync("python3", ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import directory
d = json.load(sys.stdin); print(json.dumps(directory.indexed(directory.members(d["lists"], d["roster"]), {"confirmed": True, "likely": True, "nearby": False})))`],
  { input: JSON.stringify({ lists: LISTS, roster: ROSTER }) }));
  assert.equal(out.length, DIR.people.filter(INDEXED).length, "nearby off: only listed doctors stay in the sitemap");
  assert.doesNotMatch((await get(LIKELY.p)).html, /name="robots"/, "indexed group: no robots tag");
});

test("review round 1: security headers on every profile response, since site/_headers skips Functions", async () => {
  const { SECURITY } = await import("../lib/directory.mjs");
  const file = read("_headers");
  for (const [k, v] of Object.entries(SECURITY)) assert.ok(file.includes(`${k}: ${v}`), `same as site/_headers: ${k}`);
  const npi = npiOf(LIKELY);
  for (const [path, status] of [[LIKELY.p, 200], [`/doctors/x-${npi}/`, 301], ["/doctors/x-1234567893/", 404]]) {
    const r = await get(path); assert.equal(r.status, status);
    for (const k of Object.keys(SECURITY)) assert.ok(r.h.get(k), `${status} ${k}`);
  }
  resetDirectory();
  const r = await handleDoctor(new Request("http://localhost" + LIKELY.p, { method: "POST" }), { backend: null, noCache: true, ASSETS });
  assert.equal(r.status, 405); assert.ok(r.headers.get("Content-Security-Policy"));
});

test("review round 1: an unreadable shard answers 503 no-store, then recovers", async () => {
  let n = 0;
  const flaky = { fetch: (req) => (/\/data\/doctors\//.test(new URL(req.url).pathname) && n++ === 0 ? Promise.resolve(new Response("", { status: 500 })) : ASSETS.fetch(req)) };
  resetDirectory();
  const env = { backend: null, noCache: true, ASSETS: flaky };
  let r = await handleDoctor(new Request("http://localhost" + LIKELY.p), env);
  assert.equal(r.status, 503); assert.equal(r.headers.get("Cache-Control"), "no-store");
  r = await handleDoctor(new Request("http://localhost" + LIKELY.p), env);
  assert.equal(r.status, 200);
});

test("review round 1: 404 serves the site's 404 page when Pages redirects /404.html", async () => {
  const pages = { fetch: (req) => { const u = new URL(req.url).pathname;
    if (u === "/404.html") return Promise.resolve(new Response(null, { status: 308, headers: { Location: "/404" } }));
    if (u === "/404") return ASSETS.fetch(new Request("https://assets.local/404.html"));
    return ASSETS.fetch(req); } };
  const r = await get("/doctors/x-1234567893/", { ASSETS: pages });
  assert.equal(r.status, 404); assert.match(r.html, /Page not found/); assert.match(r.html, /<footer/);
});

test("review round 1: uppercase and accented slugs with the right NPI redirect", async () => {
  const npi = npiOf(LIKELY);
  for (const bad of [`/doctors/Paul-OConnor-${npi}/`, `/doctors/ana-mar%C3%ADa-${npi}/`]) {
    const r = await get(bad); assert.equal(r.status, 301, bad); assert.equal(r.h.get("Location"), LIKELY.p);
  }
});

test("review round 1: placeholders in data stay text; JSON-LD links the doctor's page without sameAs", () => {
  const name = "Dr %%BODY%% %%TITLE%% %%HEAD%%";
  const p = mergeDoctor("1999000098", null, { ufe: { removed: [], people: [{ npi: "1999000098", name, confirmed: false, offices: [
    { practice: "P", street: "", city: "Chicago", state: "IL", zip: "60611", phone: "", lat: 41, lon: -87 }], insurances: [], blurb: "" }] } });
  p.url = "https://example.org/team/";
  const html = render("1999000098", p);
  assert.equal((html.match(/<main/g) || []).length, 1); assert.match(html, /<h1>Dr %%BODY%% %%TITLE%% %%HEAD%%<\/h1>/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  assert.equal(ld.sameAs, undefined); assert.deepEqual(ld.subjectOf, { "@type": "WebPage", url: "https://example.org/team/" });
});

// Job 42 (his yes, 2026-11-05): the 2,017 nearby profiles send noindex and leave the sitemap but stay live; a profile is
// indexed again once a procedure is known or the doctor claims it.
test("job 42: a nearby profile is live with noindex; a procedure or a claim indexes it again", async () => {
  const npi = npiOf(NEARBY), robots = /<meta name="robots" content="noindex">/;
  let r = await get(NEARBY.p);
  assert.equal(r.status, 200, "still live"); assert.match(r.html, robots, "nearby: noindex");
  assert.ok(DIR.people.length > 2600 && read("doctors/" + (NEARBY.p.split("/")[2][0]) + "/index.html").length, "still linked from the A to Z pages");
  // claimed, no procedure yet: an account with nothing attested
  r = await get(NEARBY.p, { backend: db([row(npi, NEARBY.n, "partial", [], [])]) });
  assert.equal(r.status, 200); assert.doesNotMatch(r.html, robots, "claimed: indexed");
  // a procedure becomes known (attested from the account): Likely, indexed
  r = await get(NEARBY.p, { backend: db([row(npi, NEARBY.n, "partial", ["ufe"], ["ufe"])]) });
  assert.match(r.html, /Likely performs:/); assert.doesNotMatch(r.html, robots, "procedure known: indexed");
  // an account with no level is not a claim
  r = await get(NEARBY.p, { backend: db([row(npi, NEARBY.n, "none", [], [])]) });
  assert.match(r.html, robots, "no holder: still noindex");
  // the database down: static record, setting decides
  r = await get(NEARBY.p, { backend: { data: { overlay: async () => { throw new Error("down"); } } } });
  assert.equal(r.status, 200); assert.match(r.html, robots);
  assert.doesNotMatch((await get(LIKELY.p)).html, robots, "Likely: indexed");
});

test("job 42: the static rule matches; a nearby doctor with a procedure in the next export is in the sitemap", () => {
  const out = JSON.parse(execFileSync("python3", ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import directory
d = json.load(sys.stdin); print(json.dumps(directory.indexed(directory.members(d["lists"], d["roster"]), {"confirmed": True, "likely": True, "nearby": False})))`],
  { input: JSON.stringify({ lists: { ufe: [{ npi: "1000000011", name: "Was Nearby", lat: 41.9, lon: -87.6, city: "Chicago", state: "IL" }], pae: [], gae: [] },
    roster: [{ npi: "1000000011", name: "Was Nearby", proven: true, phone: "312-555-0100", lat: 41.9, lon: -87.6, city: "Chicago", state: "IL" },
      { npi: "1000000012", name: "Still Nearby", proven: true, phone: "312-555-0101", lat: 41.9, lon: -87.6, city: "Chicago", state: "IL" }] }) }));
  assert.deepEqual(out, ["/doctors/was-nearby-1000000011/"]);
});

test("job 42: profile titles read 'Name, interventional radiologist, City, ST' with no brand", async () => {
  const r = await get(LIKELY.p);
  const t = /<title>(.*?)<\/title>/.exec(r.html)[1];
  assert.equal(t, `${LIKELY.n.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}, interventional radiologist, ${LIKELY.c}, ${LIKELY.s}`);
  assert.doesNotMatch(t, /Every Option| in /);
});
