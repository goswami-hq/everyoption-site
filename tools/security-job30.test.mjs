// Job 30 (2026-11-04): login security review, attack tests on the local stand-ins with made-up people only.
// node --test tools/security-job30.test.mjs
// Tests named "finding:" pin today's behaviour for a risk that goes to him as a decision (ai-hq
// projects/platform/accounts/security-decisions-2026-11-04.md); when he picks a fix, the test changes with it.
// Tests named "fixed:" failed before this job's fix. The rest confirm a defence holds.
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, BEN, CARA, EMAIL } from "./accounts-helpers.mjs";
import { overlayFor, handlePublic, resetForTests } from "../lib/accounts/listings.mjs";
import { onRequestPost as reportPost } from "../functions/api/report.js";

const STRANGER = "stranger@elsewhere.example";
const officeAt = (phone) => ({ practice: "Fake Vein Clinic", street: "1 Wrong Way", city: "Chicago", state: "IL", zip: "60611", phone });

// Production today has no ID check (Stripe later) and no Doximity: the same here.
const prodLike = () => { const w = world(); w.backend.identity = null; w.backend.alert = null; return w; };

// ---------------------------------------------------------------- 1. Impersonation by a stranger with no account
test("finding: a stranger signs up as a real listed doctor and changes the phone patients see, within a minute", async () => {
  const w = prodLike();
  const evil = await w.signIn(ANN, STRANGER, "203.0.113.9");       // public NPI + the stranger's own inbox
  assert.equal((await evil.post("attest", { procedures: ["ufe"], agree: true })).status, 200);
  const r = await evil.put("profile", { offices: [officeAt("3125550199")], booking_url: "https://fake-vein.example/" });
  assert.equal(r.status, 200);
  const ov = await overlayFor(w.backend, "ufe");
  const card = ov.people.find((p) => p.npi === ANN);
  assert.equal(card.offices[0].phone, "3125550199", "the stranger's phone is on the live overlay");
  assert.equal(card.booking_url, "https://fake-vein.example/");
  // Who is told: only the stranger's own inbox; a record in exceptions; no alert is configured.
  const mail = w.outbox.filter((m) => /contact details changed/.test(m.subject)).map((m) => m.to);
  assert.deepEqual(mail, [STRANGER]);
  assert.equal(w.backend.alert, null);
  const ex = await w.backend.data.many("exceptions", { kind: "contact_change" });
  assert.equal(ex.length, 1);
});

test("finding: the stranger can also take a real doctor off a procedure list (attest, then withdraw)", async () => {
  const w = prodLike();
  const evil = await w.signIn(ANN, STRANGER, "203.0.113.9");
  await evil.post("attest", { procedures: ["pae"], agree: true });
  await evil.post("withdraw", { procedure: "pae" });
  assert.ok((await overlayFor(w.backend, "pae")).removed.includes(ANN), "the finder drops Ann from PAE");
});

test("finding: the real doctor cannot recover the listing by themselves while ID and Doximity are off", async () => {
  const w = prodLike();
  await w.signIn(ANN, STRANGER, "203.0.113.9");
  const real = w.client("198.51.100.4");
  const s = await real.post("signup", { specialty: "ir", npi: ANN, email: EMAIL[ANN], agree: true });
  assert.equal(s.body.npi_taken, true);
  await real.post("code", { challenge: s.body.challenge, code: w.lastCode(EMAIL[ANN]) });
  assert.equal((await real.post("check/identity")).status, 503, "ID check off");
  assert.equal((await real.get("doximity/start")).status, 404, "Doximity off");
  // Only his own invitation (a local command) moves the listing back.
  const tok = await w.invite(ANN, "owner");
  const fresh = w.client("198.51.100.4");
  assert.equal((await fresh.post("invite/accept", { token: tok, agree: true })).status, 200);
  const me = (await fresh.get("me")).body;
  assert.equal(me.account.npi, ANN);
});

test("finding: a full-access doctor can accept their own invitation and hold another real doctor's listing", async () => {
  const w = world();
  const inviter = await w.full(ANN);
  const r = await inviter.post("invite/create", { npi: CARA });
  assert.equal(r.status, 201);
  const tok = /#invite=([0-9a-f]{64})$/.exec(r.body.url)[1];
  const other = w.client("10.0.0.1");                                  // the inviter's second browser, no email needed
  assert.equal((await other.post("invite/accept", { token: tok, agree: true })).body.level, "full");
  assert.equal((await other.get("me")).body.account.npi, CARA);
});

// ---------------------------------------------------------------- 2. Known risks
// "finding: about 12 requests ...": fixed on his yes 2026-11-04 (decision 3A, see security-job31.test.mjs).
// "finding: a few connections can use up ...": fixed on his yes 2026-11-04 (decision 3A, see security-job31.test.mjs).
test("finding: sign-up sends our code email to any inbox typed (3 an hour per address)", async () => {
  const w = world();
  const c = w.client("203.0.113.50");
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await c.post("signup", { specialty: "ir", npi: CARA, email: "someone@victims.example", agree: true })).status);
  assert.deepEqual(codes, [202, 202, 202, 429]);
  assert.equal(w.outbox.filter((m) => m.to === "someone@victims.example").length, 3);
});

// "finding: with the ID check on, an 'An Testone' ...": fixed on his yes 2026-11-04 (decision 6A, see security-job31.test.mjs).
// ---------------------------------------------------------------- 3. Sign-in
test("holds: a code works once; the sixth try fails even with the right code; expired codes fail", async () => {
  const w = world();
  const c = w.client();
  const s = await c.post("signup", { specialty: "ir", npi: CARA, email: "cara@home.example", agree: true });
  const code = w.lastCode("cara@home.example");
  assert.equal((await c.post("code", { challenge: s.body.challenge, code })).status, 200);
  assert.equal((await w.client().post("code", { challenge: s.body.challenge, code })).status, 400, "reuse");
  const l = await c.post("login", { email: "cara@home.example" });
  const right = w.lastCode("cara@home.example");
  for (let i = 0; i < 5; i++) await c.post("code", { challenge: l.body.challenge, code: right === "111111" ? "222222" : "111111" });
  assert.equal((await c.post("code", { challenge: l.body.challenge, code: right })).status, 400, "after 5 wrong tries");
  const l2 = await c.post("login", { email: "cara@home.example" });
  w.clock.t += 61 * 60000;
  assert.equal((await c.post("code", { challenge: l2.body.challenge, code: w.lastCode("cara@home.example") })).status, 400, "expired");
});

test("holds: a code is bound to the challenge in the browser that asked for it", async () => {
  const w = world();
  await w.signIn(BEN, EMAIL[BEN]);
  const evil = w.client("203.0.113.9");
  const mine = await evil.post("login", { email: "nobody@else.example" });   // no account: no email, a challenge anyway
  await w.client().post("login", { email: EMAIL[BEN] });
  assert.equal((await evil.post("code", { challenge: mine.body.challenge, code: w.lastCode(EMAIL[BEN]) })).status, 400);
});

test("holds: session cookie flags; sign-out ends the session; it ends after 12 hours", async () => {
  const w = world();
  const c = w.client();
  const s = await c.post("signup", { specialty: "ir", npi: CARA, email: "cara@home.example", agree: true });
  const r = await c.post("code", { challenge: s.body.challenge, code: w.lastCode("cara@home.example") });
  const sc = r.headers.get("Set-Cookie");
  for (const f of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/account", "Max-Age=43200"]) assert.ok(sc.includes(f), f);
  const token = c.jar.eo_session;
  assert.equal((await c.post("logout")).status, 200);
  const replay = w.client(); replay.jar.eo_session = token;
  assert.equal((await replay.get("me")).status, 401);
  const c2 = await w.signIn(BEN, EMAIL[BEN]);
  w.clock.t += 12 * 3600 * 1000 + 1;
  assert.equal((await c2.get("me")).status, 401);
});

test("holds: changing the login email needs a code to the new inbox and tells the old one", async () => {
  const w = world();
  const c = await w.signIn(BEN, EMAIL[BEN]);
  const r = await c.post("email", { email: "ben-new@home.example" });
  const other = await w.signIn(CARA, "cara@home.example");
  assert.equal((await other.post("code", { challenge: r.body.challenge, code: w.lastCode("ben-new@home.example") })).status, 401);
  const r2 = await c.post("email", { email: "ben-new@home.example" });   // that try used the code up; ask again
  assert.equal((await c.post("code", { challenge: r2.body.challenge, code: w.lastCode("ben-new@home.example") })).status, 200);
  assert.ok(w.outbox.some((m) => m.to === EMAIL[BEN] && /login email changed/.test(m.subject)));
});

test("holds: state-changing calls from another site are refused (Origin check)", async () => {
  const w = world();
  const c = await w.signIn(BEN, EMAIL[BEN]);
  const r = await c.call("PUT", "profile", { booking_url: "https://x.example/" }, { headers: { Origin: "https://evil.example" } });
  assert.equal(r.status, 403);
});

// ---------------------------------------------------------------- 4. Authorization
test("holds: one account cannot undo, edit or read another's listing; partial cannot do full-only actions", async () => {
  const w = world();
  const ann = await w.signIn(ANN, EMAIL[ANN]);
  await ann.put("profile", { booking_url: "https://ann.example/" });
  const edit = (await ann.get("edits")).body.edits.find((e) => e.field === "booking_url");
  const ben = await w.signIn(BEN, EMAIL[BEN]);
  assert.equal((await ben.post("undo", { edit_id: edit.id })).status, 404);
  assert.equal((await ben.put("profile", { npi: ANN })).status, 400, "no npi field");
  assert.equal((await ben.call("POST", "photo", new Uint8Array([0xff, 0xd8, 0xff, 0]), { headers: { "Content-Type": "image/jpeg" } })).status, 403);
  assert.equal((await ben.post("invite/create", { npi: CARA })).status, 403);
  assert.ok(!(await ben.get("edits")).body.edits.some((e) => e.id === edit.id));
});

test("holds: invitations: forged, reused, expired and revoked links fail", async () => {
  const w = world();
  assert.equal((await w.client().post("invite/accept", { token: "a".repeat(64), agree: true })).status, 400);
  const tok = await w.invite(CARA, "owner");
  assert.equal((await w.client().post("invite/accept", { token: tok, agree: true })).status, 200);
  assert.equal((await w.client().post("invite/accept", { token: tok, agree: true })).status, 400, "reuse");
  const t2 = await w.invite(BEN, "owner");
  w.clock.t += 8 * 86400000;
  assert.equal((await w.client().post("invite/accept", { token: t2, agree: true })).status, 400, "expired");
  const w2 = world();
  const inviter = await w2.full(ANN);
  const t3 = /#invite=([0-9a-f]{64})$/.exec((await inviter.post("invite/create", { npi: CARA })).body.url)[1];
  await w2.svc().revokeInviter(ANN);
  assert.equal((await w2.client().post("invite/accept", { token: t3, agree: true })).status, 400, "revoked inviter");
});

// ---------------------------------------------------------------- 5. Input and output
test("holds: links: javascript:, data:, http:, credentials, bare IPs and no-dot hosts are refused", async () => {
  const w = world();
  const c = await w.signIn(BEN, EMAIL[BEN]);
  for (const u of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<b>x</b>", "http://x.example/",
    "https://user:pw@x.example/", "https://127.0.0.1/", "https://[::1]/", "https://localhost/", "//x.example/", "https:alert"]) {
    assert.equal((await c.put("profile", { booking_url: u })).status, 400, u);
  }
  assert.equal((await c.put("profile", { booking_url: "https://xn--80ak6aa92e.com/" })).status, 200, "punycode is a normal https link");
});

test("holds: notes screen: links, emails and phone numbers are refused, including spaced and dotted forms", async () => {
  const w = world();
  const c = await w.signIn(BEN, EMAIL[BEN]);
  await c.post("attest", { procedures: ["gae"], agree: true });
  for (const t of ["Call 312 555 0100", "Book at clinic.com", "www.x.org", "write me at a@b.co", "(312)555-0100"]) {
    assert.equal((await c.put("profile", { blurbs: { gae: t } })).status, 422, t);
  }
});

// ---------------------------------------------------------------- 6. Private data
test("holds: the public overlay carries only allow-listed fields (no email, proof, level name, history)", async () => {
  const w = world();
  const c = await w.signIn(BEN, EMAIL[BEN]);
  await c.post("attest", { procedures: ["gae"], agree: true });
  await c.put("profile", { offices: [officeAt("3125550100")] });
  const ov = await overlayFor(w.backend, "gae");
  const keys = new Set(ov.people.flatMap((p) => Object.keys(p)));
  assert.deepEqual([...keys].sort(), ["blurb", "booking_url", "confirmed", "insurance_confirm", "insurance_other", "insurances", "name", "npi", "offices", "photo"]);
  assert.doesNotMatch(JSON.stringify(ov), /@|email_code|proof/);
});

// ---------------------------------------------------------------- 8. Headers on Function responses
const SEC = ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Content-Security-Policy"];
test("fixed: account API responses carry the security headers (site/_headers does not reach Functions)", async () => {
  const w = world();
  const r = await w.client().get("status");
  for (const h of SEC) assert.ok(r.headers.get(h), h);
  const e = await w.client().get("me");                       // an error answer too
  assert.equal(e.status, 401);
  for (const h of SEC) assert.ok(e.headers.get(h), h);
});

test("fixed: listings, photo errors and the report form carry the security headers", async () => {
  resetForTests();
  const w = world();
  for (const path of ["/api/listings?procedure=ufe", "/api/listings?procedure=nope", "/api/photo/1999000015-abcdef12.jpg"]) {
    const r = await handlePublic(new Request("http://localhost:8787" + path), { backend: w.backend, noCache: true });
    for (const h of SEC) assert.ok(r.headers.get(h), `${path} ${h}`);
  }
  const off = await handlePublic(new Request("http://localhost:8787/api/listings?procedure=ufe"), {});
  for (const h of SEC) assert.ok(off.headers.get(h), `not connected ${h}`);
  const rep = await reportPost({ request: new Request("http://localhost/api/report", { method: "POST", body: "{}" }), env: {} });
  for (const h of SEC) assert.ok(rep.headers.get(h), `report ${h}`);
});

// ---------------------------------------------------------------- Review round 1, fix 4: a notice after a saved change
async function useUpEmail(w) {
  for (let ip = 1; ip < 30; ip++) {
    const c = w.client(`203.0.113.${ip}`);
    for (let i = 0; i < 10; i++) await c.post("signup", { specialty: "ir", npi: CARA, email: `v${ip}-${i}@victims.example`, agree: true });
  }
}
test("fixed: with the email cap used up, his invitation over a held listing still completes, and the notice is recorded", async () => {
  const w = prodLike();
  await w.signIn(ANN, STRANGER, "203.0.113.200");
  await useUpEmail(w);
  const tok = await w.invite(ANN, "owner");
  const real = w.client("198.51.100.4");
  const r = await real.post("invite/accept", { token: tok, agree: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await real.get("me")).body.account.npi, ANN);
  assert.ok((await w.backend.data.many("exceptions", { kind: "notice_failed" })).length >= 1);
});
test("fixed: with the email cap used up, a saved edit, an undo and an email change answer 200, and the notices are recorded", async () => {
  const w = prodLike();
  const c = await w.signIn(BEN, EMAIL[BEN]);
  const ch = await c.post("email", { email: "ben-new@home.example" });
  const code = w.lastCode("ben-new@home.example");
  await useUpEmail(w);
  assert.equal((await c.put("profile", { booking_url: "https://ben.example/" })).status, 200);
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "booking_url");
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200);
  assert.equal((await c.post("code", { challenge: ch.body.challenge, code })).status, 200);
  assert.ok((await w.backend.data.many("exceptions", { kind: "notice_failed" })).length >= 3);
});
