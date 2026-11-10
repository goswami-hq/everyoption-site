// Job platform-web-design-0008 (his 3A, 2026-11-09: "make sure the links stay from one source of truth and aren't two
// separate sources that can stray"). A card's name link is the profile address the build wrote into the data ("path",
// tools/directory.py stamp_paths). No browser script builds the address; the server's one copy (lib/profile-path.mjs)
// serves only doctors who joined after the build, and agrees with the build on every name. Each link sampled here
// opens a profile page that exists. Finder results in a real browser: tools/e2e/profile_links_e2e.py.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { handleCity, resetCities } from "../lib/cities.mjs";
import { handleDoctor, resetDirectory } from "../lib/directory.mjs";
import { profilePath } from "../lib/profile-path.mjs";
import { overlayFor } from "../lib/accounts/listings.mjs";
import { CITIES } from "../lib/cities-data.mjs";

const SITE = new URL("../site/", import.meta.url), TOOLS = new URL("./", import.meta.url).pathname;
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const PROCS = ["ufe", "pae", "gae", "pelvic"];
const LISTS = Object.fromEntries(PROCS.map((k) => [k, JSON.parse(read(`data/${k}.json`)).people]));
const ROSTER = JSON.parse(read("data/ir-roster.json")).people;
const DIR = JSON.parse(read("data/directory.json")).people;
const PATH_OF = new Map();
for (const p of [...Object.values(LISTS).flat(), ...ROSTER]) if (p.path) PATH_OF.set(p.npi, p.path);
const city = async (path) => {
  resetCities(); resetDirectory();
  const r = await handleCity(new Request(`http://localhost:8787${path}`), { backend: null, noCache: true, ASSETS });
  return { status: r.status, html: await r.text() };
};
const profile = async (path) => {
  resetDirectory();
  const r = await handleDoctor(new Request(`http://localhost:8787${path}`), { backend: null, noCache: true, ASSETS });
  return r.status;
};
const cardLinks = (html) => [...html.matchAll(/<li class="card[^"]*">[\s\S]*?<h3><a href="([^"]+)">/g)].map((m) => m[1]);
const every = (xs, n) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0).slice(0, n);

test("one source: every listed doctor carries the build's address, and Python and the server agree on it", () => {
  const people = [...Object.values(LISTS).flat(), ...ROSTER].filter((p) => !p.test);
  const py = JSON.parse(execFileSync("python3", ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import directory
print(json.dumps([directory.path(p) for p in json.load(sys.stdin)]))`], { input: JSON.stringify(people.map((p) => ({ name: p.name, npi: p.npi }))) }));
  const canon = new Map(DIR.map((d) => [d.p.slice(-11, -1), d]));
  people.forEach((p, i) => {
    assert.ok(p.path, `${p.npi} has no path`);
    const d = canon.get(p.npi);
    // the address of the doctor's one directory record, even when this list spells the name differently
    if (d) assert.equal(p.path, d.p, `${p.npi}: not the directory record's address`);
    else assert.equal(p.path, py[i], p.npi);
  });
  // the server's rule (overlay doctors, the profile's own check) agrees with the build's on every directory name
  const pyDir = JSON.parse(execFileSync("python3", ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import directory
print(json.dumps([directory.path(p) for p in json.load(sys.stdin)]))`], { input: JSON.stringify(DIR.map((d) => ({ name: d.n, npi: d.p.slice(-11, -1) }))) }));
  DIR.forEach((d, i) => { assert.equal(d.p, pyDir[i], d.p); assert.equal(d.p, profilePath(d.n, d.p.slice(-11, -1)), `${d.p}: server rule strays`); });
  for (const p of LISTS.ufe.filter((x) => x.test)) assert.equal(p.path, undefined, "a test listing has no profile");
  for (const d of DIR) assert.equal(d.p, PATH_OF.get(d.p.slice(-11, -1)), `name search ${d.p}`);
  assert.ok(people.length > 3000, `count ${people.length}`);
});

test("one source: no browser script builds a profile address", () => {
  for (const f of ["assets/finder.js", "assets/directory.js", "assets/city-fold.js"]) {
    const s = read(f);
    assert.ok(!/["']\/doctors\/["']\s*\+/.test(s), `${f} joins "/doctors/" itself`);
    assert.ok(!/function slug\(/.test(s), `${f} has its own slug()`);
  }
  const f = read("assets/finder.js");
  assert.match(f, /href: p\.path/, "finder card name links to the data's path");
});

test("city pages: each sampled card's name link is the data's address and opens a profile", async () => {
  let n = 0;
  for (const k of PROCS) {
    const metros = every(CITIES.metros[k] || [], 4);
    for (const m of metros) {
      const { status, html } = await city(`${CITIES.hub[k]}${m.slug}/`);
      assert.equal(status, 200, m.slug);
      const links = cardLinks(html);
      assert.ok(links.length > 0, `${k} ${m.slug}: no cards`);
      for (const href of every(links, 3)) {
        assert.equal(href, PATH_OF.get(href.slice(-11, -1)), `${k} ${m.slug}: ${href}`);
        assert.equal(await profile(href), 200, href);
        n++;
      }
    }
  }
  assert.ok(n >= 20, `sampled ${n}`);
});

test("A to Z pages: each sampled link is the data's address and opens a profile", async () => {
  let n = 0;
  for (const letter of ["a", "g", "m", "s", "w"]) {
    const html = read(`doctors/${letter}/index.html`);
    const links = [...html.matchAll(/<li><a href="(\/doctors\/[^"]+-\d{10}\/)">/g)].map((m) => m[1]);
    assert.ok(links.length > 10, letter);
    for (const href of every(links, 4)) {
      assert.equal(href, PATH_OF.get(href.slice(-11, -1)), href);
      assert.equal(await profile(href), 200, href);
      n++;
    }
  }
  assert.equal(n, 20);
});

test("overlay: a doctor who joined after the build gets the same address from the server, and the finder uses it", async () => {
  const rows = [{ npi: "1999999981", attested: ["ufe"], held: ["ufe"], offices: [{ city: "Chicago", state: "IL", zip: "60611", lat: 41.89, lon: -87.62, geo: "address" }],
    account: { id: "x1", npi: "1999999981", level: "full", name: "Zoë D’Othee" } }];
  const ov = await overlayFor({ data: { overlay: async () => rows } }, "ufe");
  assert.equal(ov.people[0].path, "/doctors/zoe-dothee-1999999981/");
  // the finder's own merge, taken from site/assets/finder.js as written
  const F = read("assets/finder.js"), i = F.indexOf("function mergeOverlay(");
  let depth = 0, j = F.indexOf("{", i);
  for (; j < F.length; j++) { if (F[j] === "{") depth++; if (F[j] === "}" && --depth === 0) break; }
  const merge = new Function(`var CARD_KEYS = []; var TELE = null;\n${F.slice(i, j + 1)}\nreturn mergeOverlay;`)();
  const out = merge({ people: [{ npi: "1487791927", name: "A", path: "/doctors/a-1487791927/" }] }, ov);
  assert.equal(out.people.find((p) => p.npi === "1999999981").path, "/doctors/zoe-dothee-1999999981/");
  assert.equal(out.people.find((p) => p.npi === "1487791927").path, "/doctors/a-1487791927/", "a listed doctor keeps the build's address");
});
