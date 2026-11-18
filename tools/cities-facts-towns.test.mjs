// Job platform-main-0013: city pages get a local facts block, Likely cards grouped by town on pages with 5+ towns, and
// less text shared by every page. node --test tools/cities-facts-towns.test.mjs
// His words (2026-11-05): "We need to figure out how to make the city pages more unique so they show up better in search
// and AI via marketing skills".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleCity, resetCities, metroList, mergeOverlay, renderMetro, miles, town, GROUP_AT } from "../lib/cities.mjs";
import { CITIES } from "../lib/cities-data.mjs";
import { ALL } from "../lib/registry.mjs";
import { PROC_SHORT } from "../lib/procedures.mjs";

const SITE = new URL("../site/", import.meta.url);
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
// Every procedure with a list, from the registry (job platform-directory-0035). The pages checked are UFE's: fixed, because
// the facts block's first lines are tested against the UFE list; the "we also list" line covers every other procedure.
const LISTS = Object.fromEntries(ALL.map((k) => [k, JSON.parse(read(`data/${k}.json`)).people]));
const get = async (path) => {
  resetCities();
  const r = await handleCity(new Request(`http://localhost:8787${path}`), { backend: null, noCache: true, ASSETS });
  return r.text();
};
const npis = (html) => [...html.matchAll(/<li class="card[^"]*">[\s\S]*?<h3><a href="\/doctors\/[^"]*-(\d{10})\/">/g)].map((m) => m[1]);
const factLines = (html) => {
  const m = /<ul class="facts" aria-label="Local facts">(.*?)<\/ul>/.exec(html);
  return m ? [...m[1].matchAll(/<li>(.*?)<\/li>/g)].map((x) => x[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&")) : [];
};
const num = (s, re) => { const m = re.exec(s); assert.ok(m, `${re} in "${s}"`); return m[1]; };

test("facts block: 4 to 6 standalone lines under the answer, and every number matches a recount of the card list", async () => {
  for (const m of CITIES.metros.ufe) {
    const html = await get(`/fibroids/doctors/${m.slug}/`), lines = factLines(html), list = metroList(LISTS.ufe, m);
    assert.ok(lines.length >= 4 && lines.length <= 6, `${m.slug}: ${lines.length} lines`);
    assert.ok(html.indexOf('<p class="answer">') < html.indexOf('<ul class="facts"'), "under the answer");
    assert.ok(html.indexOf('<ul class="facts"') < html.indexOf("<h2>Which doctors"), "above the list");
    // recount, independent of the page's own code: from each center, every doctor's nearest office
    const d = LISTS.ufe.filter((p) => !p.test).map((p) => {
      const spots = p.offices && p.offices.some((o) => o.lat != null) ? p.offices.filter((o) => o.lat != null) : (p.lat != null ? [p] : []);
      const ds = spots.flatMap((o) => m.centers.map((c) => miles(c.ll, [o.lat, o.lon])));
      return ds.length ? Math.min(...ds) : Infinity;
    }).filter((x) => x <= 25);
    assert.equal(d.length, npis(html).length, `${m.slug}: recount matches the cards`);
    const [a, b, c, e, f] = lines;
    assert.match(a, /^As of October 29, 2026, we list /, "first line carries the listings date");
    assert.equal(+num(a, /we list (\d+) doctors? for UFE within 10 miles/), d.filter((x) => x <= 10).length, `${m.slug}: within 10`);
    assert.equal(+num(a, /, and (\d+) within 25 miles\.$/), d.length, `${m.slug}: within 25`);
    const near = Math.min(...d), said = num(b, /is (under 1 mile|\d+ miles?) from ZIP/);
    assert.equal(said, near < 1 ? "under 1 mile" : `${Math.round(near)} mile${Math.round(near) === 1 ? "" : "s"}`, `${m.slug}: nearest`);
    const towns = new Set(npis(html).map((n) => town(list.find((p) => p.npi === n)))).size;
    if (towns === 1) assert.match(c, /all work in one town/, `${m.slug}: one town`);
    else assert.equal(+num(c, /work in (\d+) towns/), towns, `${m.slug}: towns`);
    const practices = new Set(list.map((p) => ((p.lead ? p.lead.practice : p.practice) || "").trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean));
    assert.equal(+num(c, /at (\d+) separate practices?\./), practices.size, `${m.slug}: practices`);
    for (const p of list) for (const name of [p.practice, p.lead && p.lead.practice]) if (name && name.length > 3) assert.ok(!lines.join(" ").includes(name), `${m.slug}: no practice names (${name})`);
    assert.match(e, new RegExp(`^None of the ${d.length} doctors listed for UFE .* confirmed it on Every Option yet\\.$`), `${m.slug}: confirmed 0`);
    const others = ALL.filter((k) => k !== "ufe").map((k) => [k, metroList(LISTS[k], m).length]).filter(([, n]) => n);
    if (others.length) {
      for (const [k, n] of others) assert.ok(f.includes(`${n} doctor${n === 1 ? "" : "s"} for ${PROC_SHORT[k]}`), `${m.slug}: ${k} ${n} in "${f}"`);
    } else assert.equal(f, undefined);
    for (const l of lines) {
      assert.match(l, /^[A-Z].*\.$/, `${m.slug}: a whole sentence: ${l}`);
      assert.ok(l.split(/\s+/).length <= 30, `${m.slug}: short: ${l}`);
      assert.doesNotMatch(l, /practicing|\bbest\b|\btop\b|rank/i);
    }
  }
});

test("town groups: 5+ towns grouped with jump links, every card once, nearest first in each town; fewer towns keep one list", async () => {
  let grouped = 0;
  for (const m of CITIES.metros.ufe) {
    const html = await get(`/fibroids/doctors/${m.slug}/`), list = metroList(LISTS.ufe, m);
    const towns = new Set(list.map(town)), got = npis(html);
    assert.equal(new Set(got).size, got.length, `${m.slug}: no card twice`);
    assert.deepEqual([...got].sort(), list.map((p) => p.npi).sort(), `${m.slug}: every card`);
    assert.doesNotMatch(html, /<details|\shidden[\s>]|display:\s*none/, "JS off: nothing folded away");
    if (towns.size < GROUP_AT) {
      assert.doesNotMatch(html, /town-group/, `${m.slug}: one list`);
      assert.deepEqual(got, list.map((p) => p.npi), `${m.slug}: nearest first`);
      continue;
    }
    grouped++;
    const groups = [...html.matchAll(/<div class="town-group"><h4 id="([^"]+)">(.*?)<span class="count">(\d+) doctors?<\/span><\/h4>(.*?)<\/ol>/g)];
    assert.equal(groups.length, towns.size, `${m.slug}: one heading per town`);
    const jump = /<p class="towns" id="towns">(.*?)<\/p>/.exec(html)[1];
    const links = [...jump.matchAll(/href="#([^"]+)"/g)].map((x) => x[1]);
    assert.deepEqual(links, groups.map((g) => g[1]), `${m.slug}: jump links in the order of the groups`);
    assert.equal(new Set(links).size, links.length, `${m.slug}: ids unique`);
    for (const [, , name, n, body] of groups) {
      const ids = npis(body), want = list.filter((p) => town(p) === name.replace(/&#39;/g, "'")).map((p) => p.npi);
      assert.deepEqual(ids, want, `${m.slug} ${name}: the town's cards, nearest first`);
      assert.equal(+n, ids.length, `${m.slug} ${name}: count`);
    }
    assert.doesNotMatch(html, /<h2>Where are they\?<\/h2>/, "the town line became the jump links");
  }
  assert.ok(grouped >= 8, `pages grouped: ${grouped}`);
});

test("Confirmed stays above every town group: the 0 box today, and a confirmed doctor's tier with an account", async () => {
  const m = CITIES.metros.ufe.find((x) => x.slug === "new-york-city-area");
  const html = await get(`/fibroids/doctors/${m.slug}/`);
  const box = html.indexOf("Confirmed by physician: 0 nearby."), first = html.indexOf('<div class="town-group">');
  assert.ok(box > 0 && first > box && html.indexOf('id="towns"') > box, "0 box above the jump links and groups");
  const base = metroList(LISTS.ufe, m), pick = base[5];
  const people = mergeOverlay(LISTS.ufe, { people: [{ npi: pick.npi, name: pick.name, confirmed: true, offices: [] }], removed: [] });
  const list = metroList(people, m).sort((a, b) => (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0));
  const out = renderMetro("ufe", m, list, [], [], { indexable: false });
  const tierA = out.indexOf('<section class="tier tier-a"');
  assert.ok(tierA > 0 && tierA < out.indexOf('<div class="town-group">'), "Confirmed tier above the groups");
  assert.equal(npis(out).filter((n) => n === pick.npi).length, 1, "the confirmed doctor shows once, in Confirmed");
  assert.equal(npis(out)[0], pick.npi);
  assert.ok(factLines(out)[3].startsWith(`1 of the ${list.length} doctors listed for UFE near New York City has confirmed it`));
});

test("less shared text: one sentence and the fibroid link; the blank line is one sentence; no clinical claim added", async () => {
  for (const m of CITIES.metros.ufe) {
    const html = await get(`/fibroids/doctors/${m.slug}/`);
    const right = /<h2>Is UFE right for me\?<\/h2>\n<p>(.*?)<\/p>/.exec(html)[1];
    assert.equal(right, 'Uterine fibroid embolization (UFE) is a less invasive procedure for fibroids that cause heavy periods, pain, or pressure, and you keep your uterus. <a href="/fibroids/">Read about your fibroid treatment options</a>.');
    const blank = /<h2>A blank is not a no<\/h2>\n<p>(.*?)<\/p>/.exec(html)[1];
    assert.equal(blank.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, `${m.slug}: one sentence: ${blank}`);
    assert.match(blank, /^A missing doctor usually means we have not found them yet/);
  }
});
