// Job 42: UFE city pages rendered on request, and the index fixes before launch. node --test tools/cities-job42.test.mjs
// His words (2026-11-05): "We want the pages to automatically update with the doctors nearby and their details though,
// so it shouldn't be a static page, it should dynamically update".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { world, ANN } from "./accounts-helpers.mjs";
import { handleCity, resetCities, metroList, mergeOverlay, answer } from "../lib/cities.mjs";
import { handleDoctor, resetDirectory } from "../lib/directory.mjs";
import { CITIES } from "../lib/cities-data.mjs";

const SITE = new URL("../site/", import.meta.url), TOOLS = new URL("./", import.meta.url).pathname;
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const UFE = JSON.parse(read("data/ufe.json")).people;
const FIRST_11 = ["new-york-city-area", "atlanta-ga", "san-francisco-bay-area-ca", "chicago-il", "washington-dc", "philadelphia-pa",
  "los-angeles-ca", "denver-co", "south-florida", "baltimore-md", "houston-tx"];
const PROD = "everyoptionmd.com";
const get = async (path, env = {}, host = "localhost:8787") => {
  resetCities(); resetDirectory();
  const r = await handleCity(new Request(`http://${host}${path}`), { backend: null, noCache: true, ASSETS, ...env });
  return r && { status: r.status, html: await r.text(), h: r.headers };
};
const cards = (html) => [...html.matchAll(/<li class="card[^"]*">[\s\S]*?<h3><a href="\/doctors\/[^"]*-(\d{10})\/">/g)].map((m) => m[1]);
const words = (s) => s.trim().split(/\s+/).length;

// The finder's own functions, taken from site/assets/finder.js as written.
const FINDER = read("assets/finder.js");
function grab(name) {
  const i = FINDER.indexOf(`function ${name}(`);
  let depth = 0, j = FINDER.indexOf("{", i);
  for (; j < FINDER.length; j++) { if (FINDER[j] === "{") depth++; if (FINDER[j] === "}" && --depth === 0) break; }
  return FINDER.slice(i, j + 1);
}
const finder = new Function(`var CARD_KEYS = ["insurances", "insurance_other", "insurance_confirm", "booking_url"];
${grab("miles")}\n${grab("place")}\n${grab("mergeOverlay")}\nreturn { place, mergeOverlay };`)();
// The finder's search, run from each center ZIP at 25 miles; two centers: the union, each doctor at the nearer center.
function finderMetro(people, m) {
  const best = new Map();
  for (const c of m.centers) for (const p of people) {
    if (p.test) continue;
    const x = finder.place(p, c.ll, 25);
    if (x && (!best.has(p.npi) || x.miles < best.get(p.npi).miles)) best.set(p.npi, x);
  }
  return [...best.values()].sort((a, b) => a.miles - b.miles || (a.name < b.name ? -1 : 1));
}

test("the first 11 metros have pages; the recount from the data matches the lens counts and the bar", () => {
  const slugs = CITIES.metros.ufe.map((m) => m.slug);
  for (const s of FIRST_11) assert.ok(slugs.includes(s), s);
  const py = JSON.parse(execFileSync("python3", ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import cities
cfg, pages, c = cities.plan(${JSON.stringify(new URL("..", SITE).pathname)}, ${JSON.stringify(SITE.pathname)}); print(json.dumps(c["ufe"]))`]));
  const want = { "new-york-city-area": 82, "atlanta-ga": 24, "san-francisco-bay-area-ca": 22, "chicago-il": 21, "washington-dc": 21,
    "philadelphia-pa": 21, "los-angeles-ca": 13, "denver-co": 12, "south-florida": 12, "baltimore-md": 11, "houston-tx": 10,
    "dallas-fort-worth-tx": 12, "st-louis-mo": 8, "memphis-tn": 8, "phoenix-az": 8 };   // job 43: Fox, Rees, Hibler, Garby added
  for (const [s, n] of Object.entries(want)) assert.equal(py[s], n, s);
  for (const m of CITIES.metros.ufe) assert.ok(py[m.slug] >= CITIES.bar, `${m.slug} has a page only at the bar`);
  // job 43 (his yes 2026-11-05) added Phoenix, Dallas-Fort Worth, St. Louis and Memphis; tools/cities-job43.test.mjs
});

test("JavaScript off: every card on every metro page, in the finder's order, with counts matching a recount", async () => {
  for (const m of CITIES.metros.ufe) {
    const r = await get(`/fibroids/doctors/${m.slug}/`);
    assert.equal(r.status, 200, m.slug);
    assert.doesNotMatch(r.html, /<script(?! type="application\/ld\+json")/, "no script needed or loaded");
    const want = finderMetro(UFE, m).map((p) => p.npi);
    // job platform-main-0013: pages with 5+ towns group the cards by town (order checked in cities-facts-towns.test.mjs)
    if (/<div class="town-group">/.test(r.html)) assert.deepEqual([...cards(r.html)].sort(), [...want].sort(), `${m.slug}: same doctors`);
    else assert.deepEqual(cards(r.html), want, `${m.slug}: same doctors, same order as the finder`);
    assert.deepEqual(metroList(UFE, m).map((p) => p.npi), want);
    assert.match(r.html, new RegExp(`Likely performs this procedure<span class="count">${want.length} doctors`), m.slug);
    assert.ok(r.html.includes(`We list ${want.length} doctors within 25 miles of`), m.slug);
    const ans = /<p class="answer">(.*?)<\/p>/.exec(r.html)[1];
    assert.ok(words(ans) >= 40 && words(ans) <= 60, `${m.slug}: answer ${words(ans)} words`);
    assert.match(r.html, /Confirmed by physician: 0 nearby\./, "same empty Confirmed line as the ZIP search");
    assert.ok(r.html.includes('<a href="/account/?procedure=ufe">Make your free account</a>'), "claim link as in the finder");
    assert.ok(r.html.indexOf("Confirmed by physician: 0") < r.html.indexOf("Likely performs this procedure"), "above Likely");
    assert.match(r.html, /A blank is not a no/); assert.match(r.html, /Listings checked as of October 29, 2026/);
    assert.ok(r.html.includes(`/fibroids/?zip=${m.centers[0].zip}&amp;r=25#finder`), "finder link with the ZIP filled in");
    assert.match(r.html, /<a href="\/fibroids\/">Read about every fibroid treatment option<\/a>/);
    assert.match(r.html, /uterine fibroid embolization \(UFE\)/); assert.match(r.html, /less invasive/);
    assert.match(r.html, /"@type":"BreadcrumbList"/); assert.match(r.html, /<nav class="crumbs"/);
    assert.match(r.html, /<h1>Who does fibroid embolization \(UFE\) (near|in) /);
    const text = r.html.replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(text, /\b(best|top-rated|top \d|rating|rated|stars?)\b/i, `${m.slug}: no best, top or ratings`);
    assert.doesNotMatch(text, /insurance/i, "no insurance yet");
    assert.ok(!/(Grady|Emory|Northwestern)/.test(ans), "no practice names in the answer");
  }
});

test("the overlay: the server merge is the finder's mergeOverlay", () => {
  const chi = CITIES.metros.ufe.find((m) => m.slug === "chicago-il"), here = metroList(UFE, chi);
  const ov = { removed: [here[0].npi], people: [
    { npi: here[1].npi, name: here[1].name, confirmed: true, offices: [{ practice: "New Place", city: "Evanston", state: "IL", lat: 42.05, lon: -87.68, phone: "3125550199" }], booking_url: "https://x.example/" },
    { npi: "1999000098", name: "New Doc", confirmed: false, offices: [{ practice: "Lakeside IR", city: "Chicago", state: "IL", lat: 41.89, lon: -87.62 }] }] };
  const a = mergeOverlay(UFE, ov), b = finder.mergeOverlay({ people: UFE }, ov).people;
  assert.deepEqual(a, b);
});

test("live: a test account that removes UFE leaves the page within the cache time; Confirmed moves up", async () => {
  resetCities(); resetDirectory();
  const w = world(), c = await w.signIn(ANN, undefined, undefined, ["ufe"]);
  await c.put("profile", { offices: [{ practice: "Lakeside IR", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" }] });
  const env = { backend: w.backend, ASSETS, now: () => w.clock.t };
  const at = async () => { const r = await handleCity(new Request("http://localhost/fibroids/doctors/chicago-il/"), env); return r.text(); };
  let html = await at();
  assert.ok(cards(html).includes(ANN), "the account doctor appears at their office");
  assert.match(html, /22 doctors/);
  await c.post("withdraw", { procedure: "ufe" });
  w.clock.t += 30 * 1000;
  assert.ok(cards(await at()).includes(ANN), "inside the 60-second cache the page may still show them");
  w.clock.t += 31 * 1000;
  html = await at();
  assert.ok(!cards(html).includes(ANN), "gone after the cache time");
  assert.match(html, /21 doctors/);
  // a listed doctor confirmed through a full account moves to the top group
  const chi = CITIES.metros.ufe.find((m) => m.slug === "chicago-il"), last = metroList(UFE, chi).at(-1);
  const row = { npi: last.npi, attested: ["ufe"], held: ["ufe"], account: { npi: last.npi, level: "full", name: last.name }, offices: [], insurances: [], blurbs: {} };
  const r = await get("/fibroids/doctors/chicago-il/", { backend: { data: { overlay: async () => [row] } } });
  assert.equal(cards(r.html)[0], last.npi); assert.match(r.html, /Confirmed by physician<span class="count">1 doctor/);
  assert.match(/<p class="answer">(.*?)<\/p>/.exec(r.html)[1], /One confirmed it themselves, and 20 likely perform it\./);
  // a listed doctor who withdrew UFE is removed
  const gone = { ...row, attested: [], account: { ...row.account, level: "partial" } };
  const r2 = await get("/fibroids/doctors/chicago-il/", { backend: { data: { overlay: async () => [gone] } } });
  assert.ok(!cards(r2.html).includes(last.npi)); assert.equal(cards(r2.html).length, 20);
});

test("the database down or slow: the static list is served", async () => {
  const down = { data: { overlay: async () => { throw new Error("down"); } } };
  let r = await get("/fibroids/doctors/atlanta-ga/", { backend: down });
  assert.equal(r.status, 200); assert.equal(cards(r.html).length, 24);
  const slow = { data: { overlay: () => new Promise((ok) => setTimeout(() => ok([]), 300)) } };
  r = await get("/fibroids/doctors/atlanta-ga/", { backend: slow, listingsTimeoutMs: 50 });
  assert.equal(r.status, 200); assert.equal(cards(r.html).length, 24);
});

test("addresses: unknown slug and a metro under the bar 404; no trailing slash 301; hub 200", async () => {
  for (const p of ["/fibroids/doctors/nowhere/", "/fibroids/doctors/kansas-city-mo/", "/fibroids/doctors/Atlanta-GA/"]) {
    const r = await get(p); assert.equal(r.status, 404, p); assert.match(r.html, /Page not found/);
  }
  let r = await get("/fibroids/doctors/atlanta-ga");
  assert.equal(r.status, 301); assert.equal(r.h.get("Location"), "/fibroids/doctors/atlanta-ga/");
  r = await get("/fibroids/doctors");
  assert.equal(r.status, 301); assert.equal(r.h.get("Location"), "/fibroids/doctors/");
  assert.equal(await handleCity(new Request("http://localhost/fibroids/"), { ASSETS }), null, "the condition page stays static");
  r = await get("/fibroids/doctors/");
  assert.equal(r.status, 200);
  assert.match(r.html, /<h1>Where can I get fibroid embolization \(UFE\)\?<\/h1>/);
  for (const s of FIRST_11) assert.ok(r.html.includes(`href="/fibroids/doctors/${s}/"`), s);
  assert.match(r.html, /<li id="ga"><strong>Georgia<\/strong>: \d+ doctors listed\. City pages: <a href="\/fibroids\/doctors\/atlanta-ga\/">Atlanta<\/a>/);
  assert.doesNotMatch(r.html, /<script(?! type="application\/ld\+json")/);
  const post = await handleCity(new Request("http://localhost/fibroids/doctors/atlanta-ga/", { method: "POST" }), { backend: null, noCache: true, ASSETS });
  assert.equal(post.status, 405);
});

test("search engines: preview hosts send noindex; production does not, until a page drops under 5 live", async () => {
  let r = await get("/fibroids/doctors/atlanta-ga/", {}, "every-option-job-5.everyoption-site.pages.dev");
  assert.equal(r.h.get("X-Robots-Tag"), "noindex");
  r = await get("/fibroids/doctors/atlanta-ga/", {}, PROD);
  assert.equal(r.h.get("X-Robots-Tag"), null); assert.doesNotMatch(r.html, /name="robots"/);
  assert.ok(r.h.get("Content-Security-Policy") && /max-age=60/.test(r.h.get("Cache-Control")));
  assert.ok(r.html.includes('<link rel="canonical" href="https://everyoptionmd.com/fibroids/doctors/atlanta-ga/">'));
  // live removals drop Houston to 4: noindex (job 43: Phoenix has a page now; Kansas City, 6, is the under-bar case)
  const hou = CITIES.metros.ufe.find((m) => m.slug === "houston-tx"), all = metroList(UFE, hou), out = all.slice(0, all.length - 4);
  const rows = out.map((p) => ({ npi: p.npi, attested: [], held: ["ufe"], account: { npi: p.npi, level: "partial", name: p.name }, offices: [], insurances: [], blurbs: {} }));
  r = await get("/fibroids/doctors/houston-tx/", { backend: { data: { overlay: async () => rows } } }, PROD);
  assert.equal(cards(r.html).length, 4); assert.match(r.html, /<meta name="robots" content="noindex">/);
});

test("answer text: one town, one doctor, and counts with confirmed doctors read as whole sentences", () => {
  const m = CITIES.metros.ufe[0];
  const one = [{ npi: "1", name: "A", city: "X", state: "NY", miles: 1 }];
  assert.match(answer("ufe", m, one), /^We list 1 doctor within 25 miles of ZIP 10001 \(Manhattan\) who likely perform uterine fibroid embolization \(UFE\)\. They all work in one town\./);
  const two = CITIES.metros.ufe.find((x) => x.centers.length === 2);
  assert.match(answer("ufe", two, one), / or ZIP \d{5} \(/);
});

test("links: /fibroids/ lists the cities in plain HTML; a profile in a metro links back; footer and name search link the hub", async () => {
  const f = read("fibroids/index.html");
  const block = /<nav class="by-city"[\s\S]*?<\/nav>/.exec(f)[0];
  for (const s of FIRST_11) assert.ok(block.includes(`href="/fibroids/doctors/${s}/"`), s);
  assert.ok(f.indexOf("by-city") > f.indexOf('id="results"'), "under the finder");
  assert.match(read("index.html"), /<a href="\/fibroids\/doctors\/">Doctors by city<\/a>/);
  assert.match(read("doctors/index.html"), /href="\/fibroids\/doctors\/"/);
  const atl = CITIES.metros.ufe.find((m) => m.slug === "atlanta-ga"), p = metroList(UFE, atl)[0];
  resetDirectory();
  const r = await handleDoctor(new Request(`http://localhost/doctors/x-${p.npi}/`), { backend: null, noCache: true, ASSETS });
  const loc = r.headers.get("Location");
  const prof = await (await handleDoctor(new Request("http://localhost" + loc), { backend: null, noCache: true, ASSETS })).text();
  assert.match(prof, /<a href="\/fibroids\/doctors\/atlanta-ga\/">Other UFE doctors near Atlanta<\/a>/);
  const routes = JSON.parse(read("_routes.json"));
  assert.ok(routes.include.includes("/fibroids/doctors/*") && routes.include.includes("/fibroids/doctors"));
  assert.ok(!routes.include.includes("/fibroids/*"), "the condition page is not routed to a Function");
});

test("sitemaps: an index of one file per page type; drafts, /account/ and /report/ out; dates from each page", () => {
  const idx = read("sitemap.xml");
  for (const f of ["sitemap-pages.xml", "sitemap-cities.xml", "sitemap-doctors.xml"]) assert.ok(idx.includes(`https://everyoptionmd.com/${f}`), f);
  assert.match(read("robots.txt"), /Sitemap: https:\/\/everyoptionmd\.com\/sitemap\.xml/);
  const pages = read("sitemap-pages.xml");
  assert.ok(pages.includes("<loc>https://everyoptionmd.com/fibroids/</loc><lastmod>2026-11-02</lastmod>"), "fibroids reviewed date");
  for (const u of ["/account/", "/report/", "/enlarged-prostate/", "/knee-arthritis/"]) assert.ok(!pages.includes(`com${u}<`), u);
  const city = [...read("sitemap-cities.xml").matchAll(/<loc>https:\/\/everyoptionmd\.com([^<]*)<\/loc><lastmod>2026-10-29<\/lastmod>/g)].map((m) => m[1]);
  assert.deepEqual(city.sort(), ["/fibroids/doctors/", ...CITIES.metros.ufe.map((m) => `/fibroids/doctors/${m.slug}/`)].sort());
  const all = idx + pages + read("sitemap-cities.xml") + read("sitemap-doctors.xml");
  assert.ok(!all.includes("/404"), "no 404 in any sitemap");
});

test("draft condition pages send noindex; fibroids does not; 404 has no canonical; no third-party script on condition pages", () => {
  for (const s of ["enlarged-prostate", "knee-arthritis"]) assert.match(read(`${s}/index.html`), /<meta name="robots" content="noindex">/, s);
  assert.doesNotMatch(read("fibroids/index.html"), /name="robots"/);
  assert.doesNotMatch(read("404.html"), /rel="canonical"/);
  for (const s of ["fibroids", "enlarged-prostate", "knee-arthritis"]) {
    const h = read(`${s}/index.html`);
    for (const m of h.matchAll(/<script\b([^>]*)>/g)) {
      if (/type="application\/ld\+json"/.test(m[1])) continue;
      assert.match(m[1], /src="\/assets\/[a-z-]+\.js\?v=[0-9a-f]{10}"/, `${s}: own scripts only`);
    }
    assert.doesNotMatch(h, /<iframe|youtube\.com\/embed|googletagmanager|google-analytics|cloudflareinsights/i, s);
  }
});

test("static pages on any pages.dev address get noindex from site/_headers; production rules unchanged", () => {
  const h = read("_headers");
  assert.match(h, /^https:\/\/:project\.pages\.dev\/\*\n  X-Robots-Tag: noindex$/m);
  assert.match(h, /^https:\/\/:version\.:project\.pages\.dev\/\*\n  X-Robots-Tag: noindex$/m);
  assert.doesNotMatch(h, /everyoptionmd\.com/, "no rule on the production domain");
});
