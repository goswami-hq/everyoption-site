// Job platform-launch-0009 (his yes, HQ chat 2026-11-17 12:41 CT; ai-hq projects/platform/accounts/invitations-2026-11-17/list-for-him.md):
// email and code on every invitation; only used and live invitations count toward a doctor's limit; one doctor's raised
// limit (accounts.invite_limit). Fixture NPIs only.
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, BEN, CARA, GIL, DAN, EMAIL } from "./accounts-helpers.mjs";
import { exportConfirmed, CODE_TRIES } from "../lib/accounts/service.mjs";

const HAL = "1999000106", ALEK = "1999000114";
const tokOf = (url) => /#invite=([0-9a-f]{64})$/.exec(url)[1];
const card = async (w, npi) => (await exportConfirmed(w.backend)).find((x) => x.npi === npi);
const count = async (w, t, m = {}) => (await w.backend.data.many(t, m)).length;

// A session lasts 12 hours: after a clock jump, sign in again with the email and a code.
async function signInAgain(w, email, ip = "10.90.99.1") {
  const c = w.client(ip), l = await c.post("login", { email });
  assert.equal((await c.post("code", { challenge: l.body.challenge, code: w.lastCode(email) })).status, 200);
  return c;
}

// His invitation, accepted with an email and its code; returns the client.
async function his(w, npi = ANN, email = EMAIL[npi] || `${npi}@home.example`, ip = "10.90.0.1") {
  const c = w.client(ip);
  const r = await c.post("invite/accept", { token: await w.invite(npi, "owner"), agree: true, procedures: ["ufe"], email });
  if (r.status !== 200) throw new Error("accept failed " + JSON.stringify(r.body));
  return c;
}

test("his invitation: full and Confirmed; nothing is made until the code is right; can invite", async () => {
  const w = world(), c = w.client("10.90.1.1");
  const tok = await w.invite(ANN, "owner");
  const s = await c.post("invite/accept", { token: tok, agree: true, procedures: ["ufe"], email: "ann@home.example" }, { raw: true });
  assert.equal(s.status, 202); assert.match(s.body.challenge, /^[0-9a-f]{64}$/); assert.equal(s.body.email, "ann@home.example");
  assert.equal(await count(w, "accounts"), 0, "no account before the code");
  assert.equal((await w.backend.data.many("invitations"))[0].used_at, null, "the invitation is not used before the code");
  assert.equal(w.outbox.filter((m) => m.to === "ann@home.example").length, 1);
  const r = await c.post("code", { challenge: s.body.challenge, code: w.lastCode("ann@home.example") });
  assert.equal(r.status, 200); assert.equal(r.body.level, "full");
  const me = (await c.get("me")).body;
  assert.equal(me.account.level, "full"); assert.equal(me.account.email, "ann@home.example"); assert.equal(me.can.invite, true);
  assert.equal(me.invites.left, 5); assert.equal(me.invites.limit, 5);
  assert.equal((await card(w, ANN)).confirmed, true, "Confirmed");
  assert.equal((await w.backend.data.many("invitations"))[0].used_by, me.account.id);
});

test("an email already on another account is refused before a code is sent", async () => {
  const w = world();
  await w.signIn(BEN, EMAIL[BEN]);
  const n = w.outbox.length;
  const r = await w.client("10.90.2.1").post("invite/accept", { token: await w.invite(ANN, "owner"), agree: true, email: EMAIL[BEN] }, { raw: true });
  assert.equal(r.status, 409); assert.equal(r.body.error, "email_in_use"); assert.equal(w.outbox.length, n);
});

test("colleague chain two deep: both full and Confirmed; the second can invite too", async () => {
  const w = world();
  const ann = await his(w);
  const toBen = await ann.post("invite/create", { npi: BEN });
  assert.equal(toBen.status, 201); assert.equal(toBen.body.left, 4);
  const ben = w.client("10.90.3.2");
  assert.equal((await ben.post("invite/accept", { token: tokOf(toBen.body.url), agree: true, procedures: ["gae"], email: EMAIL[BEN] })).body.level, "full");
  const toCara = await ben.post("invite/create", { npi: CARA });
  assert.equal(toCara.status, 201);
  const cara = w.client("10.90.3.3");
  assert.equal((await cara.post("invite/accept", { token: tokOf(toCara.body.url), agree: true, procedures: ["ufe"], email: EMAIL[CARA] })).body.level, "full");
  for (const [c, npi] of [[ben, BEN], [cara, CARA]]) {
    const me = (await c.get("me")).body;
    assert.equal(me.account.level, "full"); assert.equal(me.account.proof, "invite_doctor"); assert.equal(me.can.invite, true);
    assert.equal((await card(w, npi)).confirmed, true);
  }
});

test("a doctor's limit: the 6th live invitation is refused; expired and withdrawn ones free their slot; used ones keep it", async () => {
  const w = world();
  const ann = await his(w);
  const made = [];
  for (const npi of [BEN, CARA, GIL, HAL, ALEK]) { const r = await ann.post("invite/create", { npi }); assert.equal(r.status, 201, JSON.stringify(r.body)); made.push(r.body); }
  assert.equal(made[4].left, 0);
  const sixth = await ann.post("invite/create", { npi: BEN });
  assert.equal(sixth.status, 403); assert.equal(sixth.body.error, "invite_limit");
  // one is used: it keeps its slot for good
  assert.equal((await w.client("10.90.4.2").post("invite/accept", { token: tokOf(made[0].url), agree: true, email: EMAIL[BEN] })).status, 200);
  // one is withdrawn (revoked) unused: its slot comes back at once
  const row = (await w.backend.data.many("invitations", { npi: CARA }))[0];
  await w.backend.data.update("invitations", { id: row.id }, { revoked_at: new Date(w.clock.t).toISOString() });
  assert.equal((await ann.get("me")).body.invites.left, 1);
  assert.equal((await ann.post("invite/create", { npi: CARA })).status, 201, "withdrawn slot reused");
  assert.equal((await ann.post("invite/create", { npi: CARA })).status, 403);
  // past 7 days the unused ones lapse: the used one still counts, the four unused ones free their slots
  w.clock.t += 7 * 86400000 + 1000;
  const ann2 = await signInAgain(w, EMAIL[ANN]);
  assert.equal((await ann2.get("me")).body.invites.left, 4);
  for (let i = 0; i < 4; i++) assert.equal((await ann2.post("invite/create", { npi: GIL })).status, 201);
  assert.equal((await ann2.post("invite/create", { npi: GIL })).body.error, "invite_limit");
});

test("the cap holds under parallel requests", async () => {
  const w = world();
  const ann = await his(w);
  const rs = await Promise.all([BEN, CARA, GIL, HAL, ALEK, BEN, CARA, GIL].map((npi) => ann.post("invite/create", { npi })));
  assert.equal(rs.filter((r) => r.status === 201).length, 5);
  assert.equal(rs.filter((r) => r.body.error === "invite_limit").length, 3);
  assert.equal(await count(w, "invitations", { inviter_account_id: (await w.backend.data.one("accounts", { npi: ANN })).id }), 5);
});

test("a raised limit lets the 6th through, and the box shows it; 0 stops all", async () => {
  const w = world();
  const ann = await his(w);
  for (const npi of [BEN, CARA, GIL, HAL, ALEK]) await ann.post("invite/create", { npi });
  assert.equal((await ann.post("invite/create", { npi: BEN })).status, 403);
  const a = await w.backend.data.one("accounts", { npi: ANN });
  await w.backend.data.update("accounts", { id: a.id }, { invite_limit: 7 });
  const me = (await ann.get("me")).body.invites;
  assert.equal(me.left, 2); assert.equal(me.limit, 7);
  const r6 = await ann.post("invite/create", { npi: BEN });
  assert.equal(r6.status, 201); assert.equal(r6.body.left, 1);
  await w.backend.data.update("accounts", { id: a.id }, { invite_limit: 0 });
  assert.equal((await ann.post("invite/create", { npi: BEN })).body.error, "invite_limit");
});

test("refused: used, expired and withdrawn links; own NPI; a non-radiologist", async () => {
  const w = world();
  const ann = await his(w);
  const used = (await ann.post("invite/create", { npi: BEN })).body.url;
  assert.equal((await w.client("10.90.6.2").post("invite/accept", { token: tokOf(used), agree: true, email: EMAIL[BEN] })).status, 200);
  const again = await w.client("10.90.6.3").post("invite/accept", { token: tokOf(used), agree: true, email: "x1@home.example" }, { raw: true });
  assert.equal(again.body.error, "invite_invalid", "used");
  const withdrawn = await w.invite(GIL, "owner");
  const wr = (await w.backend.data.many("invitations", { npi: GIL }))[0];
  await w.backend.data.update("invitations", { id: wr.id }, { revoked_at: new Date(w.clock.t).toISOString() });
  assert.equal((await w.client("10.90.6.4").post("invite/accept", { token: withdrawn, agree: true, email: "x2@home.example" }, { raw: true })).body.error, "invite_invalid", "withdrawn");
  assert.equal((await ann.post("invite/create", { npi: ANN })).body.error, "invite_self", "own NPI");
  assert.equal((await ann.post("invite/create", { npi: DAN })).body.error, "not_radiologist", "non-radiologist");
  const old = await w.invite(CARA, "owner");
  w.clock.t += 7 * 86400000 + 1000;
  assert.equal((await w.client("10.90.6.5").post("invite/accept", { token: old, agree: true, email: "x3@home.example" }, { raw: true })).body.error, "invite_invalid", "expired");
  await assert.rejects(w.svc().createInvite({ kind: "owner", npi: DAN }), /not_radiologist/);
});

test("a code sent, then the link expires before it is typed: refused, nothing made", async () => {
  const w = world(), c = w.client("10.90.7.1");
  const s = await c.post("invite/accept", { token: await w.invite(CARA, "owner"), agree: true, email: EMAIL[CARA] }, { raw: true });
  const code = w.lastCode(EMAIL[CARA]);
  w.clock.t += 7 * 86400000 + 1000;
  assert.equal((await c.post("code", { challenge: s.body.challenge, code })).body.error, "code_invalid", "the code is past its hour too");
  assert.equal(await count(w, "accounts"), 0);
});

test("an NPI another account holds: a doctor's invitation is refused, on the exceptions list, and alerted", async () => {
  const w = world();
  const ann = await his(w);
  await w.signIn(BEN, EMAIL[BEN]);
  const inv = await ann.post("invite/create", { npi: BEN });
  assert.equal(inv.body.held, true);
  const r = await w.client("10.90.8.2").post("invite/accept", { token: tokOf(inv.body.url), agree: true, email: "someone@home.example" }, { raw: true });
  assert.equal(r.status, 409); assert.equal(r.body.error, "npi_taken");
  assert.equal(await count(w, "exceptions", { kind: "invite_npi_held" }), 1);
  const alert = w.backend.alert.sent.find((t) => /invitation was refused, NPI 1999000023 already has an account/.test(t));
  assert.ok(alert, "alert sent"); assert.doesNotMatch(alert, /#invite=|https?:/, "no link in the alert");
  assert.equal((await w.backend.data.many("accounts", { npi: BEN }))[0].email, EMAIL[BEN], "holder untouched");
});

test("published-email invitation: partial, Likely performs, no invitations; the email is the invited address, fixed", async () => {
  const w = world(), c = w.client("10.90.9.1");
  const tok = await w.invite(GIL, "published", { email: "Gil.Fourtest@fourtest-vascular.example" });
  const pv = await c.post("invite/preview", { token: tok });
  assert.equal(pv.body.level, "basic"); assert.equal(pv.body.email, "gil.fourtest@fourtest-vascular.example");
  assert.equal((await c.post("invite/accept", { token: tok, agree: true, email: "other@home.example" }, { raw: true })).body.error, "invite_email_fixed");
  const s = await c.post("invite/accept", { token: tok, agree: true, procedures: ["ufe"] }, { raw: true });
  assert.equal(s.status, 202); assert.equal(s.body.email, "gil.fourtest@fourtest-vascular.example");
  const r = await c.post("code", { challenge: s.body.challenge, code: w.lastCode("gil.fourtest@fourtest-vascular.example") });
  assert.equal(r.body.level, "basic");
  const me = (await c.get("me")).body;
  assert.equal(me.account.level, "basic"); assert.equal(me.can.invite, false); assert.equal(me.invites, null);
  assert.equal((await card(w, GIL)).confirmed, false, "Likely performs");
  assert.equal((await c.post("invite/create", { npi: BEN })).status, 403);
});

test("revoke the top of the chain: everyone below drops to partial; a downstream doctor with proof keeps full", async () => {
  const w = world();
  const ann = await his(w);
  const ben = w.client("10.90.10.2");
  await ben.post("invite/accept", { token: tokOf((await ann.post("invite/create", { npi: BEN })).body.url), agree: true, procedures: ["gae"], email: EMAIL[BEN] });
  const cara = w.client("10.90.10.3");
  await cara.post("invite/accept", { token: tokOf((await ben.post("invite/create", { npi: CARA })).body.url), agree: true, procedures: ["ufe"], email: EMAIL[CARA] });
  const gil = w.client("10.90.10.4");
  await gil.post("invite/accept", { token: tokOf((await ann.post("invite/create", { npi: GIL })).body.url), agree: true, procedures: ["ufe"], email: EMAIL[GIL] });
  const proven = await w.idCheck(gil);
  assert.ok(proven.ok !== false);
  assert.equal((await w.backend.data.one("accounts", { npi: GIL })).proof, "identity");
  await w.svc().revokeInviter(ANN);
  for (const npi of [ANN, BEN, CARA]) {
    const a = await w.backend.data.one("accounts", { npi });
    assert.equal(a.level, "basic", npi); assert.equal(a.invite_banned, true);
    assert.equal((await card(w, npi)).confirmed, false);
  }
  const g = await w.backend.data.one("accounts", { npi: GIL });
  assert.equal(g.level, "full", "own proof keeps full"); assert.equal((await card(w, GIL)).confirmed, true);
});

test("wrong code three times is refused each time; the existing limit (5 tries) then stops even the right code; a new code works", async () => {
  const w = world(), c = w.client("10.90.11.1");
  const tok = await w.invite(ANN, "owner");
  const s = await c.post("invite/accept", { token: tok, agree: true, email: "ann@home.example" }, { raw: true });
  const right = w.lastCode("ann@home.example"), wrong = right === "000000" ? "111111" : "000000";
  for (let i = 0; i < 3; i++) assert.equal((await c.post("code", { challenge: s.body.challenge, code: wrong })).body.error, "code_invalid");
  assert.equal(await count(w, "accounts"), 0);
  for (let i = 3; i < CODE_TRIES; i++) await c.post("code", { challenge: s.body.challenge, code: wrong });
  assert.equal((await c.post("code", { challenge: s.body.challenge, code: right })).body.error, "code_invalid", "limit reached");
  assert.equal(await count(w, "accounts"), 0, "still nothing made");
  const s2 = await c.post("invite/accept", { token: tok, agree: true, email: "ann@home.example" }, { raw: true });
  assert.equal(s2.status, 202, "the invitation is still unused");
  assert.equal((await c.post("code", { challenge: s2.body.challenge, code: w.lastCode("ann@home.example") })).body.level, "full");
});

test("the invitation codes count against the sign-up limits (3 an hour per email)", async () => {
  const w = world();
  const tok = await w.invite(ANN, "owner");
  const sts = [];
  for (let i = 0; i < 4; i++) sts.push((await w.client("10.90.12." + i).post("invite/accept", { token: tok, agree: true, email: "ann@home.example" }, { raw: true })).status);
  assert.deepEqual(sts, [202, 202, 202, 429]);
});

test("his invitation with --trainee: a registry entry with only the trainee code passes; never for a doctor's invitation or by default", async () => {
  const w = world(), TOM = "1999000130";
  await assert.rejects(w.svc().createInvite({ kind: "owner", npi: TOM }), /not_radiologist/, "default keeps the rule");
  const r = await w.svc().createInvite({ kind: "owner", npi: TOM, trainee: true });
  assert.equal(r.ok, true); assert.equal(r.trainee, true);
  await assert.rejects(w.svc().createInvite({ kind: "published", npi: TOM, email: "tom@x.example", trainee: true }), /not_radiologist/);
  const ann = await his(w);
  assert.equal((await ann.post("invite/create", { npi: TOM, trainee: true })).body.error, "not_radiologist", "a doctor's invitation keeps the rule");
  await assert.rejects(w.svc().createInvite({ kind: "owner", npi: DAN, trainee: true }), /not_radiologist/, "a non-radiologist specialty code is still refused");
  const c = w.client("10.90.13.1");
  assert.equal((await c.post("invite/accept", { token: tokOf(r.url), agree: true, email: "tom@home.example" })).body.level, "full");
});

test("review round 1: --trainee refuses a registry entry with no codes at all", async () => {
  const w = world();
  w.backend.nppes.lookup = async () => ({ type: "NPI-1", first: "No", last: "Codes", credential: "MD", taxonomy: "", taxonomies: [] });
  await assert.rejects(w.svc().createInvite({ kind: "owner", npi: "1999000130", trainee: true }), /not_radiologist/);
});
