// Job platform-directory-0007: video visits (telehealth) on Confirmed profiles. node --test tools/telehealth.test.mjs
// His words (2026-11-06): "Whether they see telemedicine consultations or not ... It should be only on confirmed profiles".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { world, ANN, BEN, EMAIL } from "./accounts-helpers.mjs";
import { exportConfirmed } from "../lib/accounts/service.mjs";
import { overlayFor } from "../lib/accounts/listings.mjs";
import { mergeDoctor, render } from "../lib/directory.mjs";
import { mergeOverlay as cityMerge, card as cityCard } from "../lib/cities.mjs";
import * as T from "../lib/telehealth.mjs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const OFF = { practice: "Lakeside IR", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" };
const YES = { offers: true, states: ["NY", "IL", "NJ"] };
const overlay = async (w, proc = "ufe") => overlayFor(w.backend, proc);
const person = async (w, npi, proc = "ufe") => (await overlay(w, proc)).people.find((x) => x.npi === npi);
const settle = () => new Promise((r) => setTimeout(r, 5));

test("checks: boolean or null offers, known two-letter states, at most 56, a yes needs a state", async () => {
  assert.deepEqual(T.cleanTelehealth(YES), { offers: true, states: ["IL", "NJ", "NY"] }, "kept in one order");
  assert.deepEqual(T.cleanTelehealth({ offers: true, states: ["NY", "NY"] }), { offers: true, states: ["NY"] });
  assert.deepEqual(T.cleanTelehealth({ offers: null, states: [] }), T.TELE_DEFAULT);
  assert.deepEqual(T.cleanTelehealth({ offers: false, states: ["NY"] }), { offers: false, states: ["NY"] }, "a no keeps the states for next time");
  assert.equal(T.TELE_STATES.length, 56);
  assert.deepEqual(T.cleanTelehealth({ offers: true, states: T.TELE_STATES }).states.length, 56, "all 56 is allowed");
  for (const bad of [{ offers: "yes", states: ["NY"] }, { offers: 1, states: ["NY"] }, { offers: true, states: ["XX"] },
    { offers: true, states: ["ny"] }, { offers: true, states: [] }, { offers: true, states: "NY" }, { offers: true, states: ["NY"], extra: 1 },
    { offers: true, states: [...T.TELE_STATES, "NY"] }, [], "yes", null])
    assert.equal(T.cleanTelehealth(bad), null, JSON.stringify(bad));
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  for (const bad of [{ offers: "true", states: ["NY"] }, { offers: true, states: ["ZZ"] }, { offers: true, states: Array(57).fill("NY") }]) {
    const r = await c.put("profile", { telehealth: bad });
    assert.equal(r.status, 400, JSON.stringify(bad)); assert.deepEqual(r.body.fields, ["telehealth"]);
  }
});

test("partial access saves it, but it never leaves the database; full access publishes it; it shows by itself on full", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  await c.put("profile", { offices: [OFF] });
  assert.equal((await c.put("profile", { telehealth: YES })).status, 200);
  assert.deepEqual((await c.get("me")).body.profile.telehealth, { offers: true, states: ["IL", "NJ", "NY"] }, "the doctor sees their answer");
  const p = await person(w, ANN);
  assert.equal(p.confirmed, false); assert.equal("telehealth" in p, false, "not in /api/listings");
  assert.equal("telehealth" in (await exportConfirmed(w.backend)).find((x) => x.npi === ANN), false, "not in the export");
  assert.ok(!JSON.stringify(await overlay(w)).includes("telehealth"));
  await w.idCheck(c);
  const f = await person(w, ANN);
  assert.equal(f.confirmed, true); assert.deepEqual(f.telehealth, { offers: true, states: ["IL", "NJ", "NY"] });
  assert.deepEqual((await exportConfirmed(w.backend)).find((x) => x.npi === ANN).telehealth, { offers: true, states: ["IL", "NJ", "NY"] });
});

test("unanswered shows nothing; a no is sent as a no with no states", async () => {
  const w = world(), c = await w.full(ANN);
  await c.put("profile", { offices: [OFF] });
  assert.equal("telehealth" in (await person(w, ANN)), false, "null: nothing");
  assert.deepEqual((await exportConfirmed(w.backend)).find((x) => x.npi === ANN).telehealth, T.TELE_DEFAULT, "the export keeps the answer as is");
  await c.put("profile", { telehealth: { offers: false, states: ["NY"] } });
  assert.deepEqual((await person(w, ANN)).telehealth, { offers: false, states: [] });
});

test("saved and undoable like the website link; the contact-change alert and email ignore it", async () => {
  const w = world(), c = await w.full(ANN);
  await c.put("profile", { offices: [OFF] }); await settle();
  const sent = w.backend.alert.sent.length, mails = w.outbox.length;
  assert.equal((await c.put("profile", { telehealth: YES })).status, 200); await settle();
  assert.equal(w.backend.alert.sent.length, sent, "no alert"); assert.equal(w.outbox.length, mails, "no email");
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "telehealth");
  assert.ok(e && e.undoable && e.by_you);
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200);
  assert.deepEqual((await w.backend.data.one("profiles", { npi: ANN })).telehealth, T.TELE_DEFAULT, "undo puts back the default");
  assert.equal("telehealth" in (await person(w, ANN)), false);
});

test("downgrade hides it and keeps it; a takeover resets it like the website link, logged and undoable", async () => {
  const w = world(), c = await w.full(ANN);
  await c.put("profile", { offices: [OFF], telehealth: YES, booking_url: "https://ann.example/" });
  await w.svc().revokeInviter(ANN);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).level, "basic");
  assert.equal("telehealth" in (await person(w, ANN)), false, "partial again: not public");
  assert.equal((await w.backend.data.one("profiles", { npi: ANN })).telehealth.offers, true, "kept in the database");

  const w2 = world(), squat = w2.client("10.7.0.1");
  await squat.post("invite/accept", { token: await w2.invite(ANN, "owner"), agree: true, procedures: ["ufe"] });
  await squat.put("profile", { offices: [OFF], telehealth: YES, booking_url: "https://evil.example/" });
  const real = w2.client("10.7.0.2");
  const s = await real.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example", agree: true, procedures: ["ufe"] });
  await real.post("code", { challenge: s.body.challenge, code: w2.lastCode("ann@home.example") });
  assert.equal((await w2.idCheck(real)).takeover, true);
  const prof = await w2.backend.data.one("profiles", { npi: ANN });
  assert.deepEqual(prof.telehealth, T.TELE_DEFAULT); assert.equal(prof.booking_url, "");
  const reset = (await real.get("edits")).body.edits.find((e) => e.field === "telehealth" && e.by_you);
  assert.ok(reset && reset.undoable, "the reset is logged and undoable");
});

test("card keys: a Likely or partial card never carries it, even if the input does", () => {
  const leak = { npi: ANN, name: "Ann Testone", confirmed: false, offices: [{ ...OFF, lat: 41.89, lon: -87.62 }], telehealth: YES };
  const ok = { ...leak, npi: BEN, name: "Ben Testtwo", confirmed: true };
  const ov = { ufe: { removed: [], people: [leak, ok] } };
  assert.equal("telehealth" in mergeDoctor(ANN, null, ov), false, "profile merge, partial");
  assert.deepEqual(mergeDoctor(BEN, null, ov).telehealth, { offers: true, states: ["IL", "NJ", "NY"] });
  const city = cityMerge([], ov.ufe);
  assert.equal("telehealth" in city.find((p) => p.npi === ANN), false, "city merge, partial");
  assert.ok(city.find((p) => p.npi === BEN).telehealth);
  assert.doesNotMatch(cityCard({ ...leak, miles: 2 }, "ufe"), /tele-badge/, "a Likely card with the field shows no badge");
  assert.match(cityCard({ ...ok, miles: 2 }, "ufe"), /<div class="card-tags"><p class="confirmed-tag">✓ Confirmed by physician<\/p><span class="tele-badge">/);
  // tools/directory.py: the static profile record
  const py = spawnSync("python3", ["-I", "-c", "import sys, json; sys.path.insert(0, 'tools'); import directory as d; " +
    "print(json.dumps([d.public_telehealth(json.loads(sys.argv[1])), d.public_telehealth({'offers': True, 'states': ['XX']}), d.TELE_STATES]))",
    JSON.stringify(YES)], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" });
  const [good, badOne, codes] = JSON.parse(py.stdout || "null") || [];
  assert.deepEqual(good, { offers: true, states: ["IL", "NJ", "NY"] }, py.stderr); assert.equal(badOne, null); assert.deepEqual(codes, T.TELE_STATES);
  for (const f of ["lib/directory.mjs", "lib/cities.mjs", "tools/directory.py", "src-assets/finder.js"])
    assert.match(read(f), /CARD_KEYS = \["insurances", "insurance_other", "insurance_confirm", "booking_url"\]/, f + ": telehealth stays out of CARD_KEYS");
});

test("profile: badge under the title line and the states; a no in the details; JSON-LD says nothing about it", () => {
  const rec = { name: "Ann Testone", practice: "Lakeside IR", city: "Chicago", state: "IL", phone: "3125550100", url: "", procs: { ufe: "confirmed" } };
  const yes = render(ANN, { ...rec, telehealth: YES });
  assert.match(yes, /<p class="badge">Interventional radiologist<\/p><div class="tele"><span class="tele-badge"><svg[^>]*aria-hidden="true"[^]*?<\/svg>Video visits<\/span><p class="tele-states">Can see patients in: IL, NJ, NY<\/p><\/div>/);
  const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(yes)[1];
  assert.doesNotMatch(ld, /video|telehealth|telemedicine|virtual/i);
  assert.match(render(ANN, { ...rec, telehealth: { offers: false, states: [] } }), /No video visits/);
  assert.doesNotMatch(render(ANN, { ...rec, telehealth: { offers: null, states: [] } }), /class="tele|video visits/i);
  assert.doesNotMatch(render(ANN, { ...rec, procs: { ufe: "likely" }, telehealth: YES }), /tele-badge/, "a Likely profile never shows it");
});

test("ZIP state and the filter rule", () => {
  for (const [z, s] of [["10001", "NY"], ["07030", "NJ"], ["60611", "IL"], ["94110", "CA"], ["00901", "PR"], ["20001", "DC"], ["20120", "VA"],
    ["34101", "FL"], ["73301", "TX"], ["99501", "AK"], ["96950", "MP"], ["09001", ""], ["1234", ""]]) assert.equal(T.zipState(z), s, z);
  assert.equal(T.teleServes(YES, "NY"), true); assert.equal(T.teleServes(YES, "CA"), false); assert.equal(T.teleServes(YES, ""), false);
  assert.equal(T.teleServes({ offers: false, states: ["NY"] }, "NY"), false);
});

test("the browser copy is the module: same checks and markup, and the finder keeps Likely cards free of it", () => {
  const built = read("site/assets/telehealth.js");
  const B = new Function("window", built + "\nreturn window.EO_TELE;")({});
  assert.equal(B.teleBadge(YES), T.teleBadge(YES)); assert.equal(B.teleProfile(YES), T.teleProfile(YES));
  assert.deepEqual(B.TELE_STATES, T.TELE_STATES); assert.equal(B.zipState("07030"), "NJ");
  const src = read("src-assets/finder.js");
  const grab = (name) => { const i = src.indexOf(`function ${name}(`); let d = 0, j = src.indexOf("{", i);
    for (; j < src.length; j++) { if (src[j] === "{") d++; if (src[j] === "}" && --d === 0) break; } return src.slice(i, j + 1); };
  const f = new Function("TELE", `var CARD_KEYS = ["insurances", "insurance_other", "insurance_confirm", "booking_url"];
${grab("mergeOverlay")}\nreturn mergeOverlay;`)(B);
  const out = f({ people: [] }, { removed: [], people: [
    { npi: ANN, name: "A", confirmed: false, offices: [], telehealth: YES }, { npi: BEN, name: "B", confirmed: true, offices: [], telehealth: YES }] }).people;
  assert.equal("telehealth" in out[0], false); assert.deepEqual(out[1].telehealth, { offers: true, states: ["IL", "NJ", "NY"] });
  for (const page of ["site/fibroids/index.html", "site/account/index.html"]) assert.match(read(page), /\/assets\/telehealth\.js\?v=/, page);
});

test("database: one jsonb column with the default, and a migration in step", () => {
  const sql = read("supabase/schema.sql"), mig = read("supabase/migrations/2026-11-06-telehealth.sql");
  assert.match(sql, /telehealth jsonb not null default '\{"offers":null,"states":\[\]\}'/);
  assert.match(mig, /add column if not exists telehealth jsonb not null default '\{"offers":null,"states":\[\]\}'/);
  const check = (s) => /check \((jsonb_typeof\(telehealth\) = 'object'[^;]*?)\)(?:,|;)/s.exec(s)[1].replace(/\s+/g, " ");
  assert.equal(check(sql), check(mig));
  assert.match(read("lib/accounts/supabase.mjs"), /photo_key,telehealth,accounts\(/, "the overlay select reads it");
});
