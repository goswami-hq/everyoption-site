// Job 11: invitations, one-step revoke, automatic takeover by a proven doctor. node --test tools/accounts-job11.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { world, FIX, ANN, BEN, CARA, GIL, DAN, EMAIL } from "./accounts-helpers.mjs";
import { exportConfirmed } from "../lib/accounts/service.mjs";

const tokOf = (url) => /#invite=([0-9a-f]{64})$/.exec(url)[1];

test("his invitation: opens to the listing; tick procedures, one agreement; full access; no form, no email", async () => {
  const w = world(), c = w.client("10.5.0.1");
  const tok = await w.invite(ANN, "owner");
  const pv = await c.post("invite/preview", { token: tok });
  assert.equal(pv.status, 200); assert.equal(pv.body.name, "Ann Testone"); assert.deepEqual(pv.body.listed_for, ["ufe", "pae"]);
  assert.equal(pv.body.level, "full"); assert.match(pv.body.agreement, /^I am Ann Testone/);
  assert.equal((await c.post("invite/accept", { token: tok, procedures: ["ufe"] })).body.error, "agree_required");
  const r = await c.post("invite/accept", { token: tok, procedures: ["ufe", "pae"], agree: true });
  assert.equal(r.status, 200); assert.equal(r.body.level, "full");
  const me = (await c.get("me")).body;
  assert.equal(me.account.npi, ANN); assert.equal(me.account.email, null, "no login email asked"); assert.equal(me.account.proof, "invite_owner");
  assert.deepEqual(me.can, { attest: true, blurbs: true, insurances: true, contact: true, photo: true, invite: true });
  assert.deepEqual(me.profile.attested, ["pae", "ufe"]);
  assert.equal(w.outbox.length, 0, "nothing sent");
  const inv = (await w.backend.data.many("invitations"))[0];
  assert.equal(inv.kind, "owner"); assert.equal(inv.inviter_account_id, null); assert.equal(inv.used_by, me.account.id);
  assert.ok(!JSON.stringify(inv).includes(tok), "token stored only as a hash");
  // a login email only when they want to edit later
  const s = await c.post("email", { email: "ann@home.example" });
  assert.equal((await c.post("code", { challenge: s.body.challenge, code: w.lastCode("ann@home.example") })).status, 200);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).email, "ann@home.example");
});

test("invitations: one NPI, one use, 7 days", async () => {
  const w = world();
  const tok = await w.invite(GIL, "owner");
  assert.equal((await w.client("10.5.1.1").post("invite/accept", { token: tok, agree: true })).status, 200);
  assert.equal((await w.client("10.5.1.2").post("invite/accept", { token: tok, agree: true })).status, 400, "used once");
  assert.equal((await w.client("10.5.1.2").post("invite/preview", { token: tok })).status, 400);
  const t2 = await w.invite(BEN, "owner");
  w.clock.t += 7 * 86400000 + 1000;
  assert.equal((await w.client("10.5.1.3").post("invite/accept", { token: t2, agree: true })).status, 400, "expired after 7 days");
  assert.equal((await w.backend.data.many("accounts", { npi: BEN })).length, 0);
  assert.equal((await w.client("10.5.1.3").post("invite/preview", { token: "f".repeat(64) })).status, 400);
});

test("a full-access doctor invites up to 5 for life, from the account page; their invitees get full and can invite 5", async () => {
  const w = world();
  const a = await w.full(ANN);
  const r = await a.post("invite/create", { npi: GIL });
  assert.equal(r.status, 201); assert.equal(r.body.left, 4); assert.equal(r.body.name, "Gil Fourtest");
  assert.equal(w.outbox.length, 1, "nothing sent by us beyond Ann's own sign-up code");
  assert.equal((await a.post("invite/create", { npi: ANN })).body.error, "invite_self");
  assert.equal((await a.post("invite/create", { npi: DAN })).body.error, "not_radiologist", "the waitlist rule holds for invitations");
  for (const n of [BEN, CARA, CARA, BEN]) assert.equal((await a.post("invite/create", { npi: n })).status, 201);
  const six = await a.post("invite/create", { npi: CARA });
  assert.equal(six.status, 403); assert.equal(six.body.error, "invite_limit");
  assert.equal((await a.get("me")).body.invites.left, 0);
  const g = w.client("10.5.2.1");
  assert.equal((await g.post("invite/accept", { token: tokOf(r.body.url), agree: true, procedures: ["ufe"] })).body.level, "full");
  const gm = (await g.get("me")).body;
  assert.equal(gm.account.proof, "invite_doctor"); assert.equal(gm.can.invite, true); assert.equal(gm.invites.left, 5);
  const basic = await w.signIn(BEN, "ben@home.example", "10.5.2.2");
  assert.equal((await basic.post("invite/create", { npi: CARA })).status, 403, "basic cannot invite");
});

test("published-email invitation: basic access, its address becomes the login email", async () => {
  const w = world(), c = w.client("10.5.3.1");
  const tok = await w.invite(GIL, "published", { email: "Gil.Fourtest@fourtest-vascular.example" });
  assert.equal((await c.post("invite/preview", { token: tok })).body.level, "basic");
  const r = await c.post("invite/accept", { token: tok, agree: true, procedures: ["ufe"] });
  assert.equal(r.body.level, "basic");
  const me = (await c.get("me")).body;
  assert.equal(me.account.email, "gil.fourtest@fourtest-vascular.example"); assert.equal(me.account.proof, "invite_published");
  assert.equal(me.can.contact, false); assert.equal(me.can.invite, false);
  assert.equal((await c.put("profile", { booking_url: "https://fourtest-vascular.example/book" })).status, 403);
});

test("an invitation cannot be made for a non-physician or an organisation; his command only from the server side", async () => {
  const w = world();
  await assert.rejects(w.svc().createInvite({ kind: "owner", npi: "1999000056" }), /not_a_physician/);
  await assert.rejects(w.svc().createInvite({ kind: "owner", npi: "1999000064" }), /npi_not_individual/);
  assert.equal((await w.client().post("invite/create", { npi: ANN })).status, 401, "no anonymous route makes invitations");
});

test("revoke a bad inviter: one step removes full access from it and everyone downstream; their unused invitations die", async () => {
  const w = world();
  const bad = w.client("10.6.0.1");
  await bad.post("invite/accept", { token: await w.invite(ANN, "owner"), agree: true, procedures: ["ufe"] });
  const r1 = await bad.post("invite/create", { npi: GIL });
  const unused = await bad.post("invite/create", { npi: BEN });
  const g = w.client("10.6.0.2");
  await g.post("invite/accept", { token: tokOf(r1.body.url), agree: true, procedures: ["ufe"] });
  const r2 = await g.post("invite/create", { npi: CARA });
  const cara = w.client("10.6.0.3");
  await cara.post("invite/accept", { token: tokOf(r2.body.url), agree: true, procedures: ["gae"] });
  await bad.put("profile", { booking_url: "https://evil.example/book" });
  await cara.put("profile", { offices: [{ practice: "", street: "1 Test Way", city: "Evanston", state: "IL", zip: "60201", phone: "3125550100" }] });
  const before = await exportConfirmed(w.backend);
  assert.equal(before.find((x) => x.npi === ANN).booking_url, "https://evil.example/book");

  const out = await w.svc().revokeInviter(ANN);
  assert.equal(out.revoked.length, 3);
  for (const npi of [ANN, GIL, CARA]) {
    const a = await w.backend.data.one("accounts", { npi });
    assert.equal(a.level, "basic", npi); assert.equal(a.invite_banned, true, npi);
  }
  assert.equal((await w.client("10.6.0.4").post("invite/accept", { token: tokOf(unused.body.url), agree: true })).status, 400, "unused invitation dead");
  assert.equal((await g.post("invite/create", { npi: DAN })).status, 403, "downstream can no longer invite");
  const after = await exportConfirmed(w.backend);
  assert.equal(after.find((x) => x.npi === ANN).booking_url, "", "contact fields leave the card");
  assert.deepEqual(after.find((x) => x.npi === CARA).offices, []);
  assert.equal((await w.backend.data.many("exceptions", { kind: "inviter_revoked" })).length, 1);
  assert.ok((await w.backend.data.many("edits", { field: "level" })).length >= 3, "logged");
});

test("revoke keeps full access for someone downstream with their own ID proof", async () => {
  const w = world();
  const bad = w.client("10.6.1.1");
  await bad.post("invite/accept", { token: await w.invite(ANN, "owner"), agree: true });
  const r = await bad.post("invite/create", { npi: GIL });
  const g = w.client("10.6.1.2");
  await g.post("invite/accept", { token: tokOf(r.body.url), agree: true });
  await g.post("email", { email: "gil@home.example" }).then((s) => g.post("code", { challenge: s.body.challenge, code: w.lastCode("gil@home.example") }));
  await w.idCheck(g);
  assert.equal((await w.backend.data.one("accounts", { npi: GIL })).proof, "identity");
  await w.svc().revokeInviter(ANN);
  assert.equal((await w.backend.data.one("accounts", { npi: GIL })).level, "full");
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).level, "basic");
});

test("takeover: a doctor proven by ID takes over an NPI held without that proof; the old account loses it and is told", async () => {
  const w = world();
  const squat = await w.signIn(ANN, "squatter@x.example", "10.7.0.1", ["ufe", "pae"]);
  await squat.put("profile", { blurbs: { ufe: "Wrong words." } });
  const real = w.client("10.7.0.2");
  const s = await real.post("signup", { npi: ANN, email: "ann@home.example", agree: true });
  await real.post("code", { challenge: s.body.challenge, code: w.lastCode("ann@home.example") });
  const r = await w.idCheck(real);
  assert.equal(r.takeover, true);
  const me = (await real.get("me")).body;
  assert.equal(me.account.npi, ANN); assert.equal(me.account.level, "full"); assert.equal(me.account.proof, "identity");
  const old = await w.backend.data.one("accounts", { email: "squatter@x.example" });
  assert.equal(old.npi, null); assert.equal(old.lost_npi, ANN); assert.equal(old.level, "none");
  assert.equal((await squat.get("me")).status, 401, "old account signed out");
  assert.ok(w.outbox.some((m) => m.to === "squatter@x.example" && /no longer holds NPI 1999000015/.test(m.text)), "told");
  // edits stay logged and the new holder can undo them
  const log = (await real.get("edits")).body.edits;
  const wrong = log.find((e) => e.field === "blurbs" && !e.by_you);
  assert.ok(wrong, "the squatter's edit stays on record");
  assert.equal((await w.backend.data.one("profiles", { npi: ANN })).blurbs.ufe, undefined, "and leaves the card at takeover");
  assert.deepEqual((await w.backend.data.one("profiles", { npi: ANN })).attested, [], "its attestations too");
  assert.equal((await real.post("undo", { edit_id: wrong.id })).status, 409, "the newer reset sits on top of it");
  assert.equal((await w.backend.data.many("accounts", { npi: ANN })).length, 1);
  assert.equal((await w.backend.data.many("exceptions")).length, 0, "no exception: automatic");
});

test("takeover by Doximity proof; a squatter holding full by invitation loses its downstream too", async () => {
  const w = world({ doximity: true });
  const squat = w.client("10.7.1.1");
  await squat.post("invite/accept", { token: await w.invite(GIL, "owner"), agree: true });
  const inv = await squat.post("invite/create", { npi: BEN });
  const ben = w.client("10.7.1.2");
  await ben.post("invite/accept", { token: tokOf(inv.body.url), agree: true });
  const real = w.client("10.7.1.3");
  const s = await real.post("signup", { npi: GIL, email: "gil@home.example", agree: true });
  await real.post("code", { challenge: s.body.challenge, code: w.lastCode("gil@home.example") });
  const st = await real.call("GET", "doximity/start");
  const state = new URL(st.headers.get("Location"), "http://x").searchParams.get("state");
  const code = w.backend.doximity.grant({ id: "dx-gil", first: "Gil", last: "Fourtest", specialty: "Radiology" });
  const cb = await real.call("GET", `doximity/callback?code=${code}&state=${state}`);
  const r = await real.post("doximity/link", { token: /#doximity=([0-9a-f]{64})$/.exec(cb.headers.get("Location"))[1] });
  assert.equal(r.body.takeover, true);
  assert.equal((await w.backend.data.one("accounts", { npi: GIL })).email, "gil@home.example");
  assert.equal((await w.backend.data.one("accounts", { npi: BEN })).level, "basic", "the squatter's invitee loses full");
});

test("dispute: an NPI already held with Doximity or ID proof is not taken over; it goes to exceptions", async () => {
  const w = world();
  await w.full(ANN, "ann@home.example");
  const other = w.client("10.7.2.1");
  const s = await other.post("signup", { npi: ANN, email: "ann.other@x.example", agree: true });
  await other.post("code", { challenge: s.body.challenge, code: w.lastCode("ann.other@x.example") });
  const r = await w.idCheck(other);
  assert.equal(r.dispute, true);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).email, "ann@home.example");
  assert.equal((await w.backend.data.many("exceptions", { kind: "dispute" })).length, 1);
  assert.equal((await other.get("me")).body.dispute, true);
});

test("an invitation for an NPI held by someone else: a doctor's goes to exceptions; his takes it over (recovery)", async () => {
  const w = world();
  const a = await w.full(ANN);
  const holder = await w.signIn(GIL, "someone@x.example", "10.8.0.1");
  const r = await a.post("invite/create", { npi: GIL });
  assert.equal(r.body.held, true);
  const c = w.client("10.8.0.2");
  const x = await c.post("invite/accept", { token: tokOf(r.body.url), agree: true });
  assert.equal(x.status, 409); assert.match(x.body.message, /already has an account/);
  assert.equal((await w.backend.data.many("exceptions", { kind: "invite_npi_held" })).length, 1);
  assert.equal((await c.post("invite/preview", { token: tokOf(r.body.url) })).status, 200, "not used up");
  const own = await w.invite(GIL, "owner");
  assert.equal((await c.post("invite/accept", { token: own, agree: true })).status, 200);
  assert.equal((await w.backend.data.one("accounts", { email: "someone@x.example" })).npi, null);
  assert.equal((await holder.get("me")).status, 401);
  assert.equal((await c.get("me")).body.account.npi, GIL);
});

test("the holder accepting an invitation upgrades in place", async () => {
  const w = world();
  const b = await w.signIn(BEN, EMAIL[BEN]);
  const tok = await w.invite(BEN, "owner");
  assert.equal((await b.post("invite/accept", { token: tok, agree: true, procedures: ["gae"] })).body.level, "full");
  const a = await w.backend.data.many("accounts", { npi: BEN });
  assert.equal(a.length, 1); assert.equal(a[0].level, "full"); assert.equal(a[0].email, "ben@home.example");
});

// ---- Review round 1 fixes (job 11) ----
import { nameMatch, radiologistKey } from "../lib/accounts/util.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { supabaseData } from "../lib/accounts/supabase.mjs";
import { makeService } from "../lib/accounts/service.mjs";

test("r1-1: after a takeover the squatter's contact details, photo and attestations leave the card; the claimant's procedures replace them", async () => {
  const w = world();
  const squat = w.client("10.9.0.1");
  await squat.post("invite/accept", { token: await w.invite(ANN, "owner"), agree: true, procedures: ["ufe", "pae"] });
  await squat.put("profile", { booking_url: "https://evil.example/book", blurbs: { ufe: "Squatter words." }, insurances: ["Aetna"],
    offices: [{ practice: "Fake", street: "1 Test Way", city: "Chicago", state: "IL", zip: "60611", phone: "3125550199" }] });
  const ph = await squat.call("POST", "photo", pngBytes(), { headers: { "Content-Type": "image/png" } });
  assert.equal(ph.status, 200, JSON.stringify(ph.body));
  assert.ok((await w.backend.data.one("profiles", { npi: ANN })).photo_key, "squatter photo on file before");
  const real = w.client("10.9.0.2");
  const s = await real.post("signup", { npi: ANN, email: "ann@home.example", agree: true, procedures: ["gae"] });
  await real.post("code", { challenge: s.body.challenge, code: w.lastCode("ann@home.example") });
  assert.equal((await w.idCheck(real)).takeover, true);
  const card = (await exportConfirmed(w.backend)).find((x) => x.npi === ANN);
  assert.deepEqual(card.procedures, ["gae"]); assert.equal(card.booking_url, ""); assert.deepEqual(card.offices, []); assert.equal(card.photo, "");
  const log = (await real.get("edits")).body.edits;
  assert.ok(["booking_url", "offices", "attested"].every((f) => log.some((e) => e.field === f && e.by_you)), "resets logged");
  assert.deepEqual(card.blurbs, {}, "review round 2: notes leave too"); assert.deepEqual(card.insurances, []);
  const reset = (await real.get("edits")).body.edits.find((e) => e.field === "blurbs" && e.by_you);
  assert.equal((await real.post("undo", { edit_id: reset.id })).status, 200);
  assert.equal((await w.backend.data.one("profiles", { npi: ANN })).blurbs.ufe, "Squatter words.", "the reset is undoable");
});

test("r1-1b: his invitation over a held listing also starts a fresh card; a removed holder with no email is an exception", async () => {
  const w = world();
  const squat = w.client("10.9.1.1");
  await squat.post("invite/accept", { token: await w.invite(GIL, "owner"), agree: true, procedures: ["ufe"] });
  await squat.put("profile", { booking_url: "https://evil.example/book" });
  const c = w.client("10.9.1.2");
  await c.post("invite/accept", { token: await w.invite(GIL, "owner"), agree: true, procedures: ["gae"] });
  const card = (await exportConfirmed(w.backend)).find((x) => x.npi === GIL);
  assert.deepEqual(card.procedures, ["gae"]); assert.equal(card.booking_url, "");
  assert.equal((await w.backend.data.many("exceptions", { kind: "holder_removed_no_email" })).length, 1);
});

test("r1-2: wrong code tries are capped per email across challenges (10 a day)", async () => {
  const w = world(); await w.signIn();
  let n = 0, ch;
  for (let i = 0; i < 4 && n < 10; i++) {
    ch = (await w.client("10.9.2." + i).post("login", { email: "ann@home.example" })).body.challenge;
    for (let j = 0; j < 3 && n < 10; j++, n++) await w.client("10.9.3." + n).post("code", { challenge: ch, code: "999999" === w.lastCode() ? "999998" : "999999" });
  }
  w.clock.t += 3601 * 1000;                           // past the hourly limits, inside the day
  const last = await w.client("10.9.4.1").post("login", { email: "ann@home.example" });
  const r = await w.client("10.9.4.1").post("code", { challenge: last.body.challenge, code: w.lastCode("ann@home.example") });
  assert.equal(r.status, 429, "even the right code waits");
  w.clock.t += 86400 * 1000;
  const l2 = await w.client("10.9.4.2").post("login", { email: "ann@home.example" });
  assert.equal((await w.client("10.9.4.2").post("code", { challenge: l2.body.challenge, code: w.lastCode("ann@home.example") })).status, 200);
});

test("r1-4: the 5-invitation cap holds under parallel requests", async () => {
  const w = world();
  const a = await w.full(ANN);
  const rs = await Promise.all([GIL, BEN, CARA, GIL, BEN, CARA, GIL, BEN].map((n) => a.post("invite/create", { npi: n })));
  assert.equal(rs.filter((r) => r.status === 201).length, 5);
  assert.equal((await w.backend.data.many("invitations", { inviter_account_id: (await w.backend.data.one("accounts", { npi: ANN })).id })).length, 5);
});

test("r1-5: revoke by NPI never sends an NPI as an id filter; an inviter that lost its NPI is still found", async () => {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    if (/accounts\?select=\*&id=eq\.(?![0-9a-f]{8}-)/.test(url)) return new Response("{}", { status: 400 });
    if (/accounts\?select=\*&npi=eq\./.test(url)) return new Response("[]");
    if (/accounts\?select=\*&lost_npi=eq\.1999000015/.test(url)) return new Response(JSON.stringify([{ id: "0b8a1c2d-0000-4000-8000-000000000001", npi: null, lost_npi: "1999000015", level: "none" }]));
    return new Response("[]");
  };
  const svc = makeService({ data: supabaseData("https://a.supabase.co", "k", f) }, {});
  const r = await svc.revokeInviter("1999000015").catch((e) => e);
  assert.ok(!calls.some((u) => /id=eq\.1999000015/.test(u)), "no NPI as id");
  assert.equal(r.ok, true, "found by lost NPI: " + (r && r.message));
  await assert.rejects(svc.revokeInviter("not-an-id"), /not_found/);
});

test("r1-6: a surname that is also a title or suffix word is kept (Do)", () => {
  assert.equal(nameMatch({ first: "Anh", last: "Do" }, { first: "ANH", last: "DO" }), "exact");
  assert.equal(radiologistKey("Anh", "Do"), "do|a");
  assert.equal(nameMatch({ first: "Dr. Ann", last: "Testone Jr" }, { first: "Ann", last: "Testone" }), "exact", "titles and suffixes still go");
});

function pngBytes(w = 160, h = 160) {
  const zlib = require("node:zlib");
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 120)])));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

// ---- Review round 2 fixes (job 11) ----
test("r2-1: revoke by an NPI that more than one account touched is refused as ambiguous; the proven holder stays full", async () => {
  const w = world();
  const bad = w.client("10.10.0.1");
  await bad.post("invite/accept", { token: await w.invite(ANN, "owner"), agree: true });
  const real = w.client("10.10.0.2");
  const s = await real.post("signup", { npi: ANN, email: "ann@home.example", agree: true });
  await real.post("code", { challenge: s.body.challenge, code: w.lastCode("ann@home.example") });
  await w.idCheck(real);
  const err = await w.svc().revokeInviter(ANN).catch((e) => e);
  assert.equal(err.code, "ambiguous"); assert.equal(err.extra.candidates.length, 2);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).level, "full");
  const badId = err.extra.candidates.find((c) => !c.holds).id;
  assert.equal((await w.svc().revokeInviter(badId)).ok, true);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).level, "full", "the proven holder is untouched");
});

test("r2-5a: the waitlist rule holds for his and published invitations too", async () => {
  const w = world();
  await assert.rejects(w.svc().createInvite({ kind: "owner", npi: DAN }), /not_radiologist/);
  await assert.rejects(w.svc().createInvite({ kind: "published", npi: DAN, email: "dan@ortho.example" }), /not_radiologist/);
});

test("r2-5b: on Supabase a slot conflict (409) is retried with the next slot", async () => {
  const inviter = { id: "0b8a1c2d-0000-4000-8000-000000000001", npi: ANN, level: "full", invite_banned: false };
  let rows = 2, posts = 0;
  const f = async (url, init = {}) => {
    if (/rpc\/eo_hit/.test(url)) return new Response("true");
    if (/invitations\?select=\*&inviter_account_id=/.test(url)) return new Response(JSON.stringify(Array.from({ length: rows }, (_, i) => ({ id: "i" + i }))));
    if (/\/invitations$/.test(url) && init.method === "POST") {
      posts++; const body = JSON.parse(init.body);
      if (body.slot === 3) { rows = 3; return new Response("{}", { status: 409 }); }
      return new Response(JSON.stringify([{ id: "new", ...body }]), { status: 201 });
    }
    if (/accounts\?select/.test(url)) return new Response("[]");
    if (/edits$/.test(url)) return new Response(JSON.stringify([{ id: "e1" }]), { status: 201 });
    return new Response("[]");
  };
  const b = { data: supabaseData("https://a.supabase.co", "k", f), nppes: { async lookup() { return { type: "NPI-1", first: "Gil", last: "Fourtest", taxonomy: "2085R0204X" }; } },
    listings: { async get() { return null; } } };
  const r = await makeService(b, {}).createInvite({ kind: "doctor", npi: GIL, inviter });
  assert.equal(r.ok, true); assert.equal(posts, 2, "second try with slot 4");
});

test("takeover needs the exact first name: a near match leaves the listing where it is and goes to exceptions", async () => {
  const w = world();
  const squat = await w.signIn(ANN, "squatter@x.example", "10.7.0.1", ["ufe"]);
  const real = w.client("10.7.0.2");
  const s = await real.post("signup", { npi: ANN, email: "ann@home.example", agree: true });
  await real.post("code", { challenge: s.body.challenge, code: w.lastCode("ann@home.example") });
  await w.idCheck(real, "Annabel", FIX.nppes[ANN].last);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).email, "squatter@x.example");
  assert.equal((await w.backend.data.many("exceptions", { kind: "takeover_name_not_exact" })).length, 1);
  assert.equal((await w.idCheck(real)).takeover, true, "the exact name still takes over");
});

