// Job 30 (2026-11-04): the nearby file holds only people the finder shows, and only the fields it reads; no public
// file names anyone outside the three groups (Confirmed, Likely, nearby). node --test tools/roster-job30.test.mjs
// His rule (2026-11-03): "only groups A B C, nobody else". The file comes from ai-hq scripts/v3_job23.py site-roster.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SITE = new URL("../site/", import.meta.url).pathname;
const read = (p) => readFileSync(join(SITE, p), "utf8");
const FINDER = read("assets/finder.js");
function grab(name) {
  const i = FINDER.indexOf(`function ${name}(`);
  let depth = 0, j = FINDER.indexOf("{", i);
  for (; j < FINDER.length; j++) { if (FINDER[j] === "{") depth++; if (FINDER[j] === "}" && --depth === 0) break; }
  return FINDER.slice(i, j + 1);
}
const rosterShown = new Function(`${grab("rosterShown")}\nreturn rosterShown;`)();
const KEYS = ["npi", "name", "proven", "practice", "city", "state", "city_label", "phone", "url", "lat", "lon", "site_names"];

test("roster: every person in the public file passes the finder's filter", () => {
  const people = JSON.parse(read("data/ir-roster.json")).people;
  assert.ok(people.length > 2000, `count ${people.length}`);
  const bad = people.filter((p) => !rosterShown(p)).map((p) => p.npi);
  assert.deepEqual(bad, []);
});

test("roster: only the fields the finder reads (no billing or neuro flags)", () => {
  const people = JSON.parse(read("data/ir-roster.json")).people;
  const extra = new Set(people.flatMap((p) => Object.keys(p).filter((k) => !KEYS.includes(k))));
  assert.deepEqual([...extra], []);
  assert.doesNotMatch(read("data/ir-roster.json"), /billing/i);
});

test("public files: every NPI field and profile link under site/ belongs to someone in the three groups", () => {
  const shown = new Set(JSON.parse(read("data/directory.json")).people.map((x) => x.p.slice(-11, -1)));
  const lists = Object.fromEntries(["ufe", "pae", "gae"].map((k) => [k, JSON.parse(read(`data/${k}.json`)).people]));
  // A list person with no place and no contact (name only) is in the file but shown nowhere; allowed, listed below.
  const nameOnly = new Set(Object.values(lists).flat().filter((p) => p.lat == null && !p.phone && !p.url && !p.practice && !p.city).map((p) => p.npi));
  const test = new Set(["1999999990"]);   // the made-up test profile (localhost and previews only; launch checklist)
  const stray = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      const t = readFileSync(p, "utf8");
      const found = f.endsWith(".json")
        ? [...t.matchAll(/"npi"\s*:\s*"(\d{10})"/g), ...(p.includes("/data/doctors/") ? [...t.matchAll(/"(\d{10})"\s*:\s*\{/g)] : [])]
        : /\.(html|xml|txt)$/.test(f) ? [...t.matchAll(/\/doctors\/[a-z0-9-]+-(\d{10})\//g)] : [];
      for (const m of found) if (!shown.has(m[1]) && !nameOnly.has(m[1]) && !test.has(m[1])) stray.push(`${m[1]} ${p.slice(SITE.length)}`);
    }
  };
  walk(SITE);
  assert.deepEqual(stray, []);
  assert.ok(nameOnly.size <= 2, `name-only list people: ${[...nameOnly]}`);
});
