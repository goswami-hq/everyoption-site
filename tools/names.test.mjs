// Job platform-web-design-0018: degree and goes-by first name (his B, HQ chat 2026-11-16 18:57 CT; go 19:07 CT).
// node --test tools/names.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, FIX, ANN, BEN, EMAIL } from "./accounts-helpers.mjs";
import { exportConfirmed } from "../lib/accounts/service.mjs";
import { overlayFor } from "../lib/accounts/listings.mjs";
import { mergeDoctor, render, profilePath } from "../lib/directory.mjs";
import { mergeOverlay as cityMerge, card as cityCard } from "../lib/cities.mjs";
import * as N from "../lib/names.mjs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const OFF = { practice: "Lakeside IR", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" };
const settle = () => new Promise((r) => setTimeout(r, 5));
const person = async (w, npi, proc = "ufe") => (await overlayFor(w.backend, proc)).people.find((x) => x.npi === npi);
// Ben's registry record carries a credential with a fellowship and a middle name, as real records do.
FIX.nppes[BEN] = { ...FIX.nppes[BEN], credential: "M.D., Ph.D., FSIR", middle: "QUENTIN" };

test("the fixed list: his four and the four added at his go, nothing else", () => {
  assert.deepEqual(N.DEGREES, ["MD", "DO", "MBBS", "MBChB", "MD PhD", "DO PhD", "MD MPH", "MD MBA"]);
  for (const ok of N.DEGREES) assert.equal(N.cleanDegree(ok), ok);
  assert.equal(N.cleanDegree(""), "", "blank: as in the NPI Registry");
  for (const bad of ["md", "M.D.", "MD, FSIR", "FACR", "PhD", "MD PhD ", 1, null, undefined]) assert.equal(N.cleanDegree(bad), null, String(bad));
});

test("registry credential normalized: M.D. shows as MD; fellowships dropped; none fits gives blank", () => {
  const cases = { "M.D.": "MD", "MD": "MD", "m.d.": "MD", "D.O.": "DO", "DO, FSIR": "DO", "MD, PhD": "MD PhD", "M.D., Ph.D., FSIR": "MD PhD",
    "MD/MPH": "MD MPH", "MD MBA": "MD MBA", "D.O., Ph.D.": "DO PhD", "DO, MPH": "DO", "MBBS": "MBBS", "M.B.B.S.": "MBBS", "MBChB": "MBChB",
    "MBBS, PhD": "MBBS", "": "", "PhD": "", "RN": "", "FACR": "" };
  for (const [c, want] of Object.entries(cases)) assert.equal(N.registryDegree(c), want, c);
});

test("goes-by: letters, spaces, hyphens and apostrophes; 1 to 30; blank means the registry first name", () => {
  for (const [v, want] of [["Bob", "Bob"], ["  Mary   Ann ", "Mary Ann"], ["Jean-Luc", "Jean-Luc"], ["D’Andre", "D'Andre"], ["José", "José"], ["", ""], ["   ", ""]])
    assert.equal(N.cleanGoesBy(v), want, v);
  for (const bad of ["Bob1", "Dr. Bob", "Bob!", "<b>", "x".repeat(31), "-Bob", "Bob-", "'", "bob@x.com"])
    assert.equal(N.cleanGoesBy(bad), null, bad);
  assert.equal(N.cleanGoesBy("x".repeat(30)), "x".repeat(30));
  assert.equal(N.cleanGoesBy(5), null);
});

test("shown name: 'Goes-by Last, Degree'; registry capitals put in title case; the registry line has the middle initial", () => {
  assert.equal(N.displayName({ first: "ROBERT", last: "SMITH", credential: "M.D." }), "Robert Smith, MD");
  assert.equal(N.displayName({ first: "ROBERT", last: "SMITH", goes_by: "Bob", degree: "DO", credential: "M.D." }), "Bob Smith, DO");
  assert.equal(N.displayName({ first: "Ann", last: "McDonald" }), "Ann McDonald", "no degree known: name only; mixed case kept");
  assert.equal(N.displayName({ first: "ANNE-MARIE", last: "O'BRIEN" }), "Anne-Marie O'Brien");
  assert.equal(N.registryLine({ first: "ROBERT", middle: "JAMES", last: "SMITH", goes_by: "Bob" }), "Listed in the NPI Registry (the national list of U.S. health care providers) as Robert J. Smith");
  assert.equal(N.registryLine({ first: "ROBERT", last: "SMITH", goes_by: "Bob" }), "Listed in the NPI Registry (the national list of U.S. health care providers) as Robert Smith");
  assert.equal(N.registryLine({ first: "ROBERT", last: "SMITH", goes_by: "robert" }), "", "same as the registry first name: no line");
  assert.equal(N.registryLine({ first: "ROBERT", middle: "JAMES", last: "SMITH" }), "", "no goes-by: no line");
});

test("service: saves degree and goes-by; refuses anything else; the last name cannot be sent", async () => {
  const w = world(), c = await w.signIn(BEN, EMAIL[BEN], undefined, ["ufe"]);
  const me0 = (await c.get("me")).body;
  assert.equal(me0.names.registry_degree, "MD PhD", "the registry's credential was kept at sign-up");
  assert.equal(me0.names.shown, `${N.nameCase(FIX.nppes[BEN].first)} ${N.nameCase(FIX.nppes[BEN].last)}, MD PhD`);
  assert.deepEqual(me0.names.degrees, N.DEGREES);
  for (const [k, v] of [["degree", "FSIR"], ["degree", "md"], ["goes_by", "Bob1"], ["goes_by", "x".repeat(31)]]) {
    const r = await c.put("profile", { [k]: v });
    assert.equal(r.status, 400, `${k}=${v}`); assert.deepEqual(r.body.fields, [k]);
  }
  for (const k of ["last_name", "last", "name", "first_name"]) assert.equal((await c.put("profile", { [k]: "Other" })).status, 400, k);
  const r = await c.put("profile", { degree: "DO", goes_by: "Bob" });
  assert.equal(r.status, 200); assert.deepEqual(r.body.changed.sort(), ["degree", "goes_by"]);
  const me1 = (await c.get("me")).body;
  assert.equal(me1.names.shown, `Bob ${N.nameCase(FIX.nppes[BEN].last)}, DO`);
  assert.match(me1.names.registry_line, /^Listed in the NPI Registry \(the national list of U\.S\. health care providers\) as \S+ Q\. \S+$/);
  assert.equal((await c.put("profile", { degree: "", goes_by: "" })).status, 200, "the reset: as in the NPI Registry");
  assert.equal((await c.get("me")).body.names.shown, me0.names.shown);
});

test("history: each change kept with its time; undo puts it back", async () => {
  const w = world(), c = await w.signIn(BEN, EMAIL[BEN], undefined, ["ufe"]);
  await c.put("profile", { goes_by: "Bob" });
  await c.put("profile", { degree: "MD MBA" });
  const ed = (await c.get("edits")).body.edits;
  const gb = ed.find((e) => e.field === "goes_by"), dg = ed.find((e) => e.field === "degree");
  assert.equal(gb.before, ""); assert.equal(gb.after, "Bob"); assert.ok(gb.at); assert.equal(gb.undoable, true);
  assert.equal(dg.after, "MD MBA"); assert.equal(dg.undoable, true);
  assert.equal((await c.post("undo", { edit_id: gb.id })).status, 200);
  assert.equal((await c.get("me")).body.profile.goes_by, "");
});

test("alerts: every degree or goes-by change posts NPI, old and new to the alerts channel; the save never waits", async () => {
  const w = world(), c = await w.signIn(BEN, EMAIL[BEN], undefined, ["ufe"]);
  await settle();
  const n0 = w.backend.alert.sent.length;
  await c.put("profile", { degree: "DO", goes_by: "Bob" });
  await settle();
  const a = w.backend.alert.sent.slice(n0);
  assert.equal(a.length, 1, "one alert for one save");
  assert.match(a[0], new RegExp(`degree or first name changed, NPI ${BEN}`));
  assert.match(a[0], /degree: "\(as in the NPI Registry: MD PhD\)" -> "DO"/);
  assert.match(a[0], /goes-by first name: "\(registry first name, [^)]+\)" -> "Bob"/);
  assert.match(a[0], /Now shown as "Bob [^"]+, DO"/);
  assert.equal((await w.backend.data.many("exceptions", { kind: "name_change" })).length, 1, "recorded too");
  await c.put("profile", { degree: "DO" });                // no change: no alert
  await settle();
  assert.equal(w.backend.alert.sent.length, n0 + 1);
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "degree");
  await c.post("undo", { edit_id: e.id });
  await settle();
  assert.equal(w.backend.alert.sent.length, n0 + 2, "an undo alerts too");
  assert.match(w.backend.alert.sent.at(-1), /degree: "DO" -> "\(as in the NPI Registry: MD PhD\)"/);
  // The save never waits for the alert: with the alert service down, the save still answers 200.
  w.backend.alert.fail = true;
  assert.equal((await c.put("profile", { goes_by: "Robbie" })).status, 200);
});

test("shown on the overlay, profile, finder data, city cards and structured data; the address and name search keep the registry name", async () => {
  const w = world(), c = await w.signIn(BEN, EMAIL[BEN], undefined, ["ufe"]);
  await c.put("profile", { offices: [OFF] });
  const before = await person(w, BEN);
  const reg = `${N.nameCase(FIX.nppes[BEN].first)} ${N.nameCase(FIX.nppes[BEN].last)}`;
  assert.equal(before.display, `${reg}, MD PhD`, "default: the registry degree");
  assert.equal("registry_line" in before, false, "no goes-by: no registry line");
  await c.put("profile", { goes_by: "Bob", degree: "MD" });
  const p = await person(w, BEN);
  const shown = `Bob ${N.nameCase(FIX.nppes[BEN].last)}, MD`;
  assert.equal(p.display, shown);
  assert.equal(p.path, before.path, "the profile address does not change");
  assert.match(p.registry_line, /^Listed in the NPI Registry \(the national list/);
  const ov = { ufe: await overlayFor(w.backend, "ufe") };
  const d = mergeDoctor(BEN, null, ov);
  assert.equal(d.display, shown);
  const html = render(BEN, d);
  assert.match(html, new RegExp(`<h1>${shown}</h1><p class="badge">Interventional radiologist</p><p class="small muted reg-name">Listed in the NPI Registry \\(the national list`));
  assert.match(html, new RegExp(`<title>${shown}, interventional radiologist`));
  assert.match(html, new RegExp(`"@type":"Person","name":"${shown}"`));
  assert.equal(profilePath(d.name, BEN), p.path);
  const cityPeople = cityMerge([{ npi: BEN, name: FIX.listings[BEN] ? FIX.listings[BEN].name : "x", path: p.path, city: "Chicago", state: "IL", lat: 41.9, lon: -87.6 }], ov.ufe);
  const card = cityCard({ ...cityPeople[0], miles: 2 }, "ufe");
  assert.match(card, new RegExp(`>${shown}</a></h3>`));
  assert.doesNotMatch(card, /Listed in the NPI Registry/, "not on cards");
  // The finder and A to Z read display from the overlay and keep searching the registry name.
  assert.match(read("src-assets/finder.js"), /p\.display \|\| p\.name/);
  assert.match(read("src-assets/directory.js"), /x\.f = fold\(x\.n \+ \(x\.d \?/);
  assert.equal((await exportConfirmed(w.backend)).find((x) => x.npi === BEN).display, shown);
});

test("a takeover clears the old holder's degree and goes-by", async () => {
  const w = world(), c = await w.signIn(BEN, EMAIL[BEN], undefined, ["ufe"]);
  await c.put("profile", { goes_by: "Impostor", degree: "MBBS" });
  const p = await w.backend.data.one("profiles", { npi: BEN });
  assert.equal(p.goes_by, "Impostor");
  assert.match(read("lib/accounts/service.mjs"), /also_performs_other: "", degree: "", goes_by: "",\n\s+attested: procsFrom\(procs\)/, "freshCard resets both");
});

test("a profile made before this job reads the registry once on the account page", async () => {
  const w = world(), c = await w.signIn(BEN, EMAIL[BEN], undefined, ["ufe"]);
  await w.backend.data.update("profiles", { npi: BEN }, { registry_credential: null, registry_middle: "" });
  assert.equal((await c.get("me")).body.names.registry_degree, "MD PhD");
  assert.equal((await w.backend.data.one("profiles", { npi: BEN })).registry_credential, "M.D., Ph.D., FSIR");
});

test("database: four columns with empty defaults, the same list as the code, and a migration in step", () => {
  const schema = read("supabase/schema.sql"), mig = read("supabase/migrations/2026-11-16-name-degree.sql");
  const list = "('', " + N.DEGREES.map((d) => `'${d}'`).join(", ") + ")";
  for (const s of [schema, mig]) {
    assert.ok(s.includes(`check (degree in ${list})`), "the database list matches DEGREES");
    assert.match(s, /goes_by text not null default ''/); assert.match(s, /length\(goes_by\) <= 30/);
    assert.match(s, /registry_credential text/); assert.match(s, /registry_middle text not null default ''/);
  }
  assert.doesNotMatch(mig, /\bupdate\b|\bdelete\b|drop column/i, "never rewrites existing data");
  assert.match(read("lib/accounts/supabase.mjs"), /degree,goes_by,registry_credential,registry_middle/);
});

test("account page: the panel, the fixed list, the last-name line with both links", () => {
  const js = read("src-assets/account.js");
  assert.match(js, /panel\("name-panel", "Your name"/);
  assert.match(js, /Your last name is the one the NPI Registry showed when you signed up\. If it has changed, /);
  assert.match(js, /href: "https:\/\/nppes\.cms\.hhs\.gov\/"/);
  assert.match(js, /href: "\/report\/" \+ rq/);
  assert.match(js, /"As in the NPI Registry"/);
});
