// Job platform-launch-0011 (his words, HQ chat 2026-11-17 16:24 CT; design yes 16:26 CT): hide my profile for full-access
// doctors, his hand hide, show again, the 6-month reminder. Fixture NPIs and one real static listing (read-only).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, ANN, BEN, GIL, EMAIL } from "./accounts-helpers.mjs";
import { exportConfirmed, RECONFIRM_DAYS, HIDE_REMIND_DAYS } from "../lib/accounts/service.mjs";
import { handlePublic, resetForTests, overlayFor } from "../lib/accounts/listings.mjs";
import { handleDoctor, resetDirectory, mergeDoctor, HIDDEN } from "../lib/directory.mjs";
import { handleCity, resetCities } from "../lib/cities.mjs";
import { reminderSweep, resetSweep } from "../lib/accounts/sweep.mjs";

const SITE = new URL("../site/", import.meta.url);
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const OFF = { practice: "Lakeside IR", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" };
const DAY = 86400000;
const UFE = JSON.parse(readFileSync(new URL("data/ufe.json", SITE), "utf8")).people;
const STATIC = UFE.find((p) => p.npi === "1487791927");     // a real static UFE listing in the New York City area (read only)

const listing = async (w, proc = "ufe") => {
  resetForTests();
  const r = await handlePublic(new Request(`http://localhost/api/listings?procedure=${proc}`), { backend: w.backend, noCache: true, now: () => w.clock.t });
  return r.json();
};
const profile = async (w, path) => {
  resetDirectory();
  const r = await handleDoctor(new Request("http://localhost" + path), { backend: w.backend, noCache: true, ASSETS, now: () => w.clock.t });
  return { status: r.status, html: await r.text(), h: r.headers };
};
const city = async (w, path) => {
  resetCities(); resetDirectory();
  const r = await handleCity(new Request("http://localhost" + path), { backend: w.backend, noCache: true, ASSETS, now: () => w.clock.t });
  return r.text();
};
const annPath = `/doctors/ann-testone-${ANN}/`;
async function fullAnn(w) {
  const c = await w.full(ANN, EMAIL[ANN], ["ufe"]);
  assert.equal((await c.put("profile", { offices: [OFF], booking_url: "https://lakeside.example/" })).status, 200);
  return c;
}

test("hide: off /api/listings, the profile shows the not-listed page with noindex and nothing of theirs, off the export; show brings them back Confirmed", async () => {
  const w = world(), c = await fullAnn(w);
  let ov = await listing(w);
  assert.ok(ov.people.some((p) => p.npi === ANN && p.confirmed));
  assert.equal((await profile(w, annPath)).status, 200);
  const sent0 = w.backend.alert.sent.length;
  const h = await c.post("hide", {});
  assert.equal(h.status, 200); assert.equal(h.body.hidden, true);
  ov = await listing(w);
  assert.ok(!ov.people.some((p) => p.npi === ANN)); assert.ok(ov.removed.includes(ANN)); assert.ok(ov.hidden.includes(ANN));
  for (const proc of ["pae", "gae", "pelvic", "hae"]) assert.ok((await listing(w, proc)).hidden.includes(ANN), `${proc} hidden too`);
  const r = await profile(w, annPath);
  assert.equal(r.status, 404);
  assert.match(r.html, /This doctor is not listed right now\./);
  assert.match(r.html, /<meta name="robots" content="noindex">/);
  assert.equal(r.h.get("X-Robots-Tag"), "noindex");
  for (const bit of ["Testone", "Lakeside", "Test Plaza", "3125550100", "(312) 555-0100", "ld+json", "Confirmed", "Likely", ANN])
    assert.ok(!r.html.includes(bit), `nothing of theirs: ${bit}`);
  assert.equal((await profile(w, `/doctors/${ANN}/`)).status, 404, "the bare NPI address too");
  assert.ok(!(await exportConfirmed(w.backend)).some((x) => x.npi === ANN), "never exported while hidden");
  // everything they entered is kept, untouched
  const prof = await w.backend.data.one("profiles", { npi: ANN });
  assert.deepEqual(prof.attested, ["ufe"]); assert.equal(prof.offices.length, 1); assert.equal(prof.booking_url, "https://lakeside.example/");
  assert.equal(w.backend.alert.sent.length, sent0 + 1);
  assert.equal(w.backend.alert.sent.at(-1), `Every Option: profile hidden by the doctor (full access), NPI ${ANN}.`);
  const me = (await c.get("me")).body;
  assert.equal(me.hide.hidden, true); assert.equal(me.hide.by, "doctor"); assert.equal(me.hide.reconfirm, false);
  const s = await c.post("show", {});
  assert.equal(s.status, 200); assert.equal(s.body.hidden, false);
  ov = await listing(w);
  assert.ok(ov.people.some((p) => p.npi === ANN && p.confirmed), "back as Confirmed at once");
  assert.ok(!ov.hidden.includes(ANN));
  assert.match((await profile(w, annPath)).html, /Confirmed by physician/);
  assert.equal(w.backend.alert.sent.at(-1), `Every Option: profile shown again by the doctor (full access), NPI ${ANN}.`);
  const rows = (await w.backend.data.many("edits", { npi: ANN, field: "hidden" }));
  assert.equal(rows.length, 2, "one edits row per hide and show");
});

test("while hidden, a data refresh or a new attestation does not bring them back; a static listing stays off city pages and its profile", async () => {
  const w = world(), c = await fullAnn(w);
  await c.post("hide", {});
  assert.equal((await c.post("attest", { procedures: ["pae"], agree: true })).status, 200);
  await c.put("profile", { blurbs: { ufe: "Same-week visits." } });
  const ov = await listing(w, "pae");
  assert.ok(!ov.people.some((p) => p.npi === ANN));
  assert.equal((await profile(w, annPath)).status, 404);
  // his hand hide of a doctor with no account, listed by the static (research) data
  assert.ok(STATIC, "the static listing used here still exists");
  const path = "/fibroids/doctors/new-york-city-area/";
  assert.ok((await city(w, path)).includes(STATIC.npi) || (await city(w, path)).includes(STATIC.name), "listed before");
  const r = await w.svc().handHide(STATIC.npi, true);
  assert.equal(r.by, "every_option");
  const html = await city(w, path);
  assert.ok(!html.includes(STATIC.path) && !html.includes(`"${STATIC.name}"`), "off the city page and its structured data");
  const p = await profile(w, STATIC.path);
  assert.equal(p.status, 404); assert.match(p.html, /not listed right now/); assert.ok(!p.html.includes(STATIC.name));
  assert.ok((await listing(w)).removed.includes(STATIC.npi), "the finder drops the static card");
  const e = (await w.backend.data.many("edits", { npi: STATIC.npi, field: "hidden" }));
  assert.equal(e.length, 1); assert.equal(e[0].account_id, null); assert.equal(e[0].after.by, "every_option");
  assert.equal(mergeDoctor(STATIC.npi, {}, { ufe: { people: [], removed: [], hidden: [STATIC.npi] } }), HIDDEN);
});

test("show again over 12 months since the last confirmation: reconfirm first, which re-ticks each procedure's statement", async () => {
  const w = world(), c = await fullAnn(w);
  await c.post("hide", {});
  w.clock.t += (RECONFIRM_DAYS + 2) * DAY;
  const c2 = await w.signIn(ANN, EMAIL[ANN]);
  const me = (await c2.get("me")).body;
  assert.equal(me.hide.reconfirm, true);
  const n0 = (await w.backend.data.many("attestations", { npi: ANN })).length;
  const r = await c2.post("show", {});
  assert.equal(r.status, 409); assert.equal(r.body.error, "reconfirm_needed");
  assert.ok((await listing(w)).hidden.includes(ANN), "still hidden");
  const ok = await c2.post("show", { reconfirm: true });
  assert.equal(ok.status, 200);
  assert.equal((await w.backend.data.many("attestations", { npi: ANN })).length, n0 + 1, "a fresh attestation per listed procedure");
  assert.ok((await listing(w)).people.some((p) => p.npi === ANN && p.confirmed));
  // and the next hide shows again in one tap
  await c2.post("hide", {});
  assert.equal((await c2.post("show", {})).status, 200);
});

test("partial access cannot hide: no box (me.hide null) and the routes refuse; signed out is 401", async () => {
  const w = world(), ben = await w.signIn(BEN, EMAIL[BEN], undefined, ["ufe"]);
  assert.equal((await ben.get("me")).body.hide, null);
  for (const p of ["hide", "show"]) {
    const r = await ben.post(p, {});
    assert.equal(r.status, 403, p); assert.equal(r.body.error, "full_needed");
  }
  assert.equal((await w.backend.data.many("hidden_profiles")).length, 0);
  assert.equal((await w.client("10.9.9.9").post("hide", {})).status, 401);
  // a full doctor downgraded by revoke loses the box on the next call (the level is re-read every time)
  const c = await fullAnn(w);
  await w.backend.data.update("accounts", { npi: ANN }, { level: "basic" });
  assert.equal((await c.post("hide", {})).status, 403);
});

test("his hide blocks the doctor's show; the page says hidden by Every Option; the doctor cannot undo it; his undo and show work", async () => {
  const w = world(), c = await fullAnn(w);
  const r = await w.svc().handHide(ANN, true);
  assert.equal(r.hidden, true);
  const me = (await c.get("me")).body;
  assert.equal(me.hide.hidden, true); assert.equal(me.hide.by, "every_option");
  const s = await c.post("show", {});
  assert.equal(s.status, 403); assert.equal(s.body.error, "hidden_by_us");
  assert.equal((await c.post("hide", {})).body.by, "every_option", "a doctor's hide on top changes nothing");
  const ed = (await c.get("edits")).body.edits.find((e) => e.field === "hidden");
  assert.equal(ed.undoable, false);
  assert.equal((await c.post("undo", { edit_id: ed.id })).status, 403);
  assert.ok((await listing(w)).hidden.includes(ANN));
  // his undo of his hide: shown again
  await w.svc().handUndoHidden(ed.id);
  assert.ok(!(await listing(w)).hidden.includes(ANN));
  // his hide over the doctor's own hide replaces it; his unhide then shows the profile (the doctor hides again if they want)
  await c.post("hide", {});
  await w.svc().handHide(ANN, true);
  assert.equal((await c.get("me")).body.hide.by, "every_option");
  const off = await w.svc().handHide(ANN, false);
  assert.equal(off.hidden, true, "review round 1: his unhide gives the doctor's own hide back");
  assert.equal((await c.get("me")).body.hide.by, "doctor");
  assert.ok((await listing(w)).hidden.includes(ANN));
  assert.equal((await c.post("show", {})).status, 200);
  assert.ok(!(await listing(w)).hidden.includes(ANN));
  // a partial account hidden by him still sees the line (no show button)
  const ben = await w.signIn(BEN, EMAIL[BEN], undefined, ["ufe"]);
  await w.svc().handHide(BEN, true);
  assert.deepEqual((await ben.get("me")).body.hide, { hidden: true, by: "every_option", can: false });
});

test("undo: the doctor's hide and show are undoable from the history, one edits row each, and refuse after a later change", async () => {
  const w = world(), c = await fullAnn(w);
  await c.post("hide", {});
  let ed = (await c.get("edits")).body.edits.find((e) => e.field === "hidden");
  assert.equal(ed.undoable, true);
  assert.equal((await c.post("undo", { edit_id: ed.id })).status, 200);
  assert.ok(!(await listing(w)).hidden.includes(ANN), "undoing the hide shows them");
  assert.equal((await c.post("undo", { edit_id: ed.id })).body.error, "already_undone");
  await c.post("hide", {}); await c.post("show", {});
  ed = (await c.get("edits")).body.edits.find((e) => e.field === "hidden" && e.after && e.after.hidden === false && !e.undo_of);
  assert.equal((await c.post("undo", { edit_id: ed.id })).status, 200);
  assert.ok((await listing(w)).hidden.includes(ANN), "undoing the show hides them again");
  const hideEd = (await c.get("edits")).body.edits.filter((e) => e.field === "hidden" && e.after && e.after.hidden === true && !e.undo_of && !e.undone_by)[0];
  await c.post("show", {});
  assert.equal((await c.post("undo", { edit_id: hideEd.id })).body.error, "changed_since");
});

test("6-month reminder: one email at 183 days to the doctor's login email, once; none to unhidden doctors or his hides", async () => {
  const w = world(), c = await fullAnn(w);
  const gil = await w.full(GIL, EMAIL[GIL]);
  await c.post("hide", {});
  await gil.post("hide", {}); await gil.post("show", {});           // unhidden: never reminded
  await w.svc().handHide(BEN, true);                               // his hide of an NPI with no account
  const mails = () => w.outbox.filter((m) => /still hidden/.test(m.subject));
  w.clock.t += (HIDE_REMIND_DAYS - 1) * DAY;
  assert.deepEqual(await w.svc().hiddenReminders(), { sent: 0, skipped: 0 });
  w.clock.t += 2 * DAY;
  assert.equal((await w.svc().hiddenReminders()).sent, 1);
  assert.equal(mails().length, 1);
  const m = mails()[0];
  assert.equal(m.to, EMAIL[ANN]); assert.equal(m.subject, "Your Every Option profile is still hidden");
  assert.match(m.text, /sign in at http:\/\/localhost:8787\/account\//); assert.match(m.text, /does not sign you in/);
  assert.ok(!/[0-9a-f]{32}/.test(m.text), "no token in the link");
  assert.equal((await w.svc().hiddenReminders()).sent, 0, "once");
  w.clock.t += 400 * DAY;
  assert.equal((await w.svc().hiddenReminders()).sent, 0, "still once");
  assert.equal(mails().length, 1);
});

test("the reminder sweep rides on traffic: at most one database check per isolate per 10 minutes, one sweep an hour", async () => {
  const w = world(), c = await fullAnn(w);
  await c.post("hide", {});
  w.clock.t += 200 * DAY;
  resetSweep();
  const env = { backend: w.backend, now: () => w.clock.t };
  await reminderSweep(new Request("https://x.example/api/listings?procedure=ufe"), env);
  assert.equal(w.outbox.filter((m) => /still hidden/.test(m.subject)).length, 1);
  assert.equal(reminderSweep(new Request("https://x.example/"), env), null, "inside 10 minutes: nothing asked");
  assert.match(w.outbox.find((m) => /still hidden/.test(m.subject)).text, /https:\/\/x\.example\/account\//);
});

test("the overlay keeps hidden NPIs off even when their rows look public", async () => {
  const rows = [{ npi: ANN, attested: ["ufe"], offices: [], account: { id: "a1", npi: ANN, level: "full", name: "Ann" }, held: ["ufe"] },
    { npi: ANN, hidden: true }];
  const ov = await overlayFor({ data: { overlay: async () => rows } }, "ufe");
  assert.deepEqual(ov.people, []); assert.deepEqual(ov.removed, [ANN]); assert.deepEqual(ov.hidden, [ANN]);
});

test("review round 1: the photo route, a downgraded doctor's reminder, and a database failure on a hidden profile", async () => {
  const w = world(), c = await fullAnn(w);
  await w.backend.data.update("profiles", { npi: ANN }, { photo_key: `${ANN}/abcdef12.jpg` });
  assert.ok(await w.backend.data.publicPhoto(ANN));
  await c.post("hide", {});
  assert.equal(await w.backend.data.publicPhoto(ANN), null, "no photo while hidden");
  await w.backend.data.update("accounts", { npi: ANN }, { level: "basic" });
  w.clock.t += 200 * DAY;
  assert.deepEqual(await w.svc().hiddenReminders(), { sent: 0, skipped: 1 });
  // the overlay unreadable: the static page is served uncached and noindex
  resetDirectory();
  const down = { data: { overlay: async () => { throw new Error("down"); } } };
  const r = await handleDoctor(new Request("http://everyoptionmd.com" + STATIC.path), { backend: down, ASSETS, now: () => w.clock.t });
  assert.equal(r.headers.get("Cache-Control"), "no-store"); assert.equal(r.headers.get("X-Robots-Tag"), "noindex");
});
