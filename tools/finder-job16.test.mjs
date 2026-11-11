// Job 16: the finder's office rule and the test profile's host guard, run from the real site/assets/finder.js.
//   node --test tools/finder-job16.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { PROCS } from "../lib/procedures.mjs";

const SRC = readFileSync(new URL("../site/assets/finder.js", import.meta.url), "utf8");
function fn(name) {                      // the text of one top-level function in finder.js, by brace matching
  const i = SRC.indexOf(`function ${name}(`);
  assert.ok(i >= 0, name + " not found");
  let d = 0, j = SRC.indexOf("{", i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === "{") d++;
    else if (SRC[k] === "}" && --d === 0) return SRC.slice(i, k + 1);
  }
  throw new Error("unbalanced " + name);
}
const ctx = vm.createContext({});
vm.runInContext([fn("miles"), fn("place"), fn("testHost")].join("\n"), ctx);
const { place, testHost } = ctx;

const C = [41.868, -87.617];             // ZIP 60605 center (site/data/zip/606.json)
const office = (practice, lat, lon, extra = {}) => ({ practice, street: "1 Test Way", city: "X", state: "IL", zip: "60000", phone: "", lat, lon, geo: "address", ...extra });

test("a doctor with offices inside and outside the radius: sorted by the closest inside, never by one outside", () => {
  const p = { name: "A", lat: 39.8, lon: -89.6, offices: [office("Springfield", 39.8, -89.6), office("Evanston", 42.055, -87.692), office("Loop", 41.87, -87.62)] };
  const c = place(p, C, 25);
  assert.equal(c.lead.practice, "Loop"); assert.ok(c.miles < 1);
  assert.equal(c.offices.length, 3, "every office kept for the All offices list");
  assert.ok(c.offices[0].miles > 100, "the outside office keeps its own distance");
});

test("all offices outside the radius: the doctor is left out, even if the card's own point is inside", () => {
  const p = { name: "B", lat: C[0], lon: C[1], offices: [office("Springfield", 39.8, -89.6)] };
  assert.equal(place(p, C, 50), null);
});

test("two offices at equal distance: the one the doctor listed first leads", () => {
  const p = { name: "E", lat: null, lon: null, offices: [office("First", 41.9, -87.617), office("Second", 41.836, -87.617)] };
  const c = place(p, C, 25);
  assert.equal(Math.round(c.offices[0].miles * 1000), Math.round(c.offices[1].miles * 1000));
  assert.equal(c.lead.practice, "First");
});

test("a failed address uses its ZIP center; offices with no point and unclaimed listings fall back to the card's point", () => {
  const zipOnly = { name: "F", lat: 42.05, lon: -87.69, offices: [office("Z", 42.05, -87.69, { geo: "zip", street: "9 Unknown St" })] };
  assert.equal(place(zipOnly, C, 25).lead.geo, "zip");
  const old = { name: "G", lat: 41.87, lon: -87.62, offices: [{ practice: "Old", city: "Chicago", state: "IL", phone: "" }] };
  const g = place(old, C, 25); assert.ok(g && !g.lead && g.miles < 1);
  const unclaimed = { name: "H", lat: 41.87, lon: -87.62 };
  const h = place(unclaimed, C, 25); assert.ok(h && !h.lead && h.miles < 1);
  assert.equal(place({ name: "I", lat: null, lon: null }, C, 250), null);
});

test("the test profile can never load on the live host", () => {
  for (const h of ["everyoptionmd.com", "www.everyoptionmd.com", "everyoptionmd.com.evil.example", "pages.dev.everyoptionmd.com", "",
    "everyoption-site.pages.dev", "someone-else.pages.dev", "x.everyoption-site.pages.dev.evil.example"])
    assert.equal(testHost(h), false, h);
  for (const h of ["localhost", "every-option-job-5.everyoption-site.pages.dev"]) assert.equal(testHost(h), true, h);
  assert.match(SRC, /if \(!testHost\(location\.hostname\)\) return Promise\.resolve\(\[\]\);/, "the load is behind the host check");
  assert.equal((SRC.match(/test-profile\.json/g) || []).length, 1, "loaded from one place only");
});

test("the test profile is made up and never in the public procedure data", async () => {
  const t = JSON.parse(readFileSync(new URL("../site/data/test-profile.json", import.meta.url), "utf8"));
  const { npiOk } = await import("../functions/api/report.js");
  const [p] = t.people;
  assert.equal(p.name, "Sample Doctor, MD (test listing)"); assert.equal(npiOk(p.npi), false, "NPI fails the check digit");
  assert.deepEqual(p.procedures, ["ufe", "pae", "gae"]); assert.equal(p.offices.length, 3);   // fixed: what the made-up test profile file itself holds
  assert.deepEqual(p.offices.map((o) => o.zip), ["60605", "60201", "60540"]);
  assert.ok(p.offices.every((o) => /\(\d{3}\) 555-01\d\d/.test(o.phone)), "fictional 555-01xx numbers");
  assert.equal(p.booking_url, "https://example.com/");
  for (const f of readdirSync(new URL("../site/data/", import.meta.url)).filter((f) => PROCS.includes(f.replace(/\.json$/, "")))) {
    const s = readFileSync(new URL("../site/data/" + f, import.meta.url), "utf8");
    assert.ok(!s.includes(p.npi) && !s.includes("test listing") && !s.includes("test-avatar"), f + " holds the test profile");
  }
});
