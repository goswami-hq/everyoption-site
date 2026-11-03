// Stage 1 (job 11 revision): accounts by 6-digit code, levels, claiming. node --test tools/accounts-stage1.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, BEN, GIL, EMAIL } from "./accounts-helpers.mjs";
import { handle } from "../lib/accounts/http.mjs";
import { exportConfirmed } from "../lib/accounts/service.mjs";

test("no backend connected: every account route says not open and stores nothing", async () => {
  for (const [m, p] of [["GET", "status"], ["GET", "lookup?npi=" + ANN], ["POST", "signup"], ["POST", "login"], ["POST", "code"],
    ["GET", "me"], ["POST", "invite/preview"], ["POST", "invite/accept"]]) {
    const r = await handle(new Request("http://x/api/account/" + p, { method: m,
      ...(m === "POST" ? { body: JSON.stringify({ npi: ANN, email: "a@b.co", agree: true }), headers: { "Content-Type": "application/json" } } : {}) }), {});
    assert.equal(r.status, 503, p);
    assert.equal((await r.json()).error, "not_open");
  }
});

test("status when open", async () => {
  const w = world(); const r = await w.client().get("status");
  assert.equal(r.status, 200); assert.equal(r.body.open, true); assert.equal(r.body.doximity, false);
});

test("Is this you?: lookup shows the NPPES name and the procedures listed; nothing typed", async () => {
  const w = world(), c = w.client();
  const r = await c.get("lookup?npi=" + ANN);
  assert.equal(r.status, 200); assert.equal(r.body.name, "Ann Testone"); assert.deepEqual(r.body.listed_for, ["ufe", "pae"]);
  assert.equal(r.body.held, false); assert.match(r.body.agreement, /I am Ann Testone, the physician with NPI 1999000015/);
  assert.equal((await c.get("lookup?npi=1999000010")).status, 400, "bad check digit");
});

test("sign-up: one agreement, a 6-digit code typed on the page, name from NPPES, basic access, attested at once", async () => {
  const w = world(), c = w.client();
  assert.equal((await c.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example" })).body.error, "agree_required");
  const s = await c.post("signup", { specialty: "ir", npi: ANN, email: "Ann@Home.example", agree: true, procedures: ["ufe", "xyz"], name: "Typed Name" });
  assert.equal(s.status, 202); assert.match(s.body.challenge, /^[0-9a-f]{64}$/);
  assert.equal(w.outbox.length, 1); assert.equal(w.outbox[0].to, "ann@home.example");
  assert.match(w.outbox[0].subject, /^\d{6} is your Every Option code$/);
  assert.doesNotMatch(w.outbox[0].text, /https?:\/\//, "no link in the email");
  assert.equal((await w.backend.data.many("accounts")).length, 0, "no account until the code is typed");
  const r = await c.post("code", { challenge: s.body.challenge, code: w.lastCode() });
  assert.equal(r.status, 200);
  const acct = (await w.backend.data.many("accounts"))[0];
  assert.equal(acct.name, "Ann Testone", "never the typed name"); assert.equal(acct.level, "basic"); assert.equal(acct.proof, "email_code");
  const me = await c.get("me");
  assert.equal(me.body.account.npi, ANN);
  assert.deepEqual(me.body.can, { attest: true, blurbs: true, insurances: true, contact: true, photo: false, invite: false });
  assert.equal(me.body.group, "likely", "job 22: an email code alone is partial access, Likely performs");
  assert.deepEqual((await w.backend.data.one("profiles", { npi: ANN })).attested, ["ufe"]);
  const at = await w.backend.data.many("attestations", { npi: ANN });
  assert.match(at[0].statement, /I personally perform uterine fibroid/); assert.match(at[0].agreement, /I accept the Every Option terms/);
  assert.doesNotMatch(at[0].agreement, /ticked/, "job 22: the agreement no longer speaks of ticked procedures");
  const ex = (await exportConfirmed(w.backend))[0];
  assert.equal(ex.npi, ANN); assert.equal(ex.confirmed, false, "job 22: an email code alone is not confirmed by physician");
});

test("codes: one hour, single use, 5 wrong tries, stored only as salted hashes", async () => {
  const w = world(), c = w.client();
  const s = await c.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example", agree: true });
  const code = w.lastCode();
  const rows = await w.backend.data.many("codes");
  assert.ok(!JSON.stringify(rows).includes(code) && !JSON.stringify(rows).includes(s.body.challenge), "neither stored raw");
  w.clock.t += 61 * 60 * 1000;
  assert.equal((await c.post("code", { challenge: s.body.challenge, code })).status, 400, "expired after an hour");
  const s2 = await c.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example", agree: true });
  const code2 = w.lastCode();
  const wrong = code2 === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await c.post("code", { challenge: s2.body.challenge, code: wrong })).status, 400);
  assert.equal((await c.post("code", { challenge: s2.body.challenge, code: code2 })).status, 400, "dead after 5 wrong tries");
  const s3 = await c.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example", agree: true });
  const code3 = w.lastCode();
  assert.equal((await c.post("code", { challenge: s3.body.challenge, code: code3 })).status, 200);
  assert.equal((await w.client("10.0.0.9").post("code", { challenge: s3.body.challenge, code: code3 })).status, 400, "second use");
  assert.equal((await c.post("code", { challenge: "zz", code: "12" })).status, 400);
});

test("sign-in by code; same answer whether or not the email has an account; logout", async () => {
  const w = world(); await w.signIn();
  const c = w.client("10.0.0.3");
  const a = await c.post("login", { email: "ann@home.example" });
  const b = await w.client("10.0.0.4").post("login", { email: "nobody@else.example" });
  assert.equal(a.status, b.status); assert.deepEqual(Object.keys(a.body).sort(), Object.keys(b.body).sort()); assert.equal(a.body.message, b.body.message);
  assert.equal(w.outbox.filter((m) => m.to === "nobody@else.example").length, 0);
  assert.equal((await w.client("10.0.0.4").post("code", { challenge: b.body.challenge, code: "123456" })).status, 400);
  assert.equal((await c.post("code", { challenge: a.body.challenge, code: w.lastCode("ann@home.example") })).status, 200);
  assert.equal((await c.get("me")).status, 200);
  await c.post("logout");
  assert.equal((await c.get("me")).status, 401);
});

test("sessions: cookie is HttpOnly, Secure, SameSite=Strict; expired session is refused", async () => {
  const w = world(), c = w.client();
  const s = await c.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example", agree: true });
  const r = await c.call("POST", "code", { challenge: s.body.challenge, code: w.lastCode() });
  const sc = r.headers.get("Set-Cookie");
  for (const f of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/account"]) assert.ok(sc.includes(f), f);
  w.clock.t += 13 * 3600 * 1000;
  assert.equal((await c.get("me")).status, 401);
});

test("a shared email is told plainly it is in use; one email, one account", async () => {
  const w = world(); await w.signIn(ANN, "shared@home.example");
  const r = await w.client("10.0.0.2").post("signup", { specialty: "ir", npi: GIL, email: "shared@home.example", agree: true });
  assert.equal(r.status, 409); assert.equal(r.body.error, "email_in_use"); assert.match(r.body.message, /already has an Every Option account/);
  assert.equal(w.outbox.filter((m) => m.to === "shared@home.example").length, 1, "no second code");
});

test("signing up again on your own NPI with your own email is a sign-in", async () => {
  const w = world(); await w.signIn();
  const c = w.client("10.0.0.5");
  const s = await c.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example", agree: true });
  assert.equal(s.body.signin, true);
  assert.equal((await c.post("code", { challenge: s.body.challenge, code: w.lastCode() })).status, 200);
  assert.equal((await w.backend.data.many("accounts")).length, 1);
});

test("one account per NPI: a second claimant is told plainly and gets a claimant account with no NPI", async () => {
  const w = world(); await w.signIn();
  const c2 = w.client("10.0.0.2");
  const s = await c2.post("signup", { specialty: "ir", npi: ANN, email: "someone@other.example", agree: true });
  assert.equal(s.status, 202); assert.equal(s.body.npi_taken, true); assert.match(s.body.message, /already has an account/);
  assert.equal((await c2.post("code", { challenge: s.body.challenge, code: w.lastCode("someone@other.example") })).status, 200);
  const me = (await c2.get("me")).body;
  assert.equal(me.account.npi, null); assert.equal(me.account.claim_npi, ANN); assert.equal(me.account.level, "none");
  assert.deepEqual(me.can, { attest: false, blurbs: false, insurances: false, contact: false, photo: false, invite: false });
  assert.equal((await c2.post("attest", { procedures: ["ufe"], agree: true })).status, 403);
  assert.equal((await c2.put("profile", { blurbs: { ufe: "Hi." } })).status, 403);
  assert.equal((await w.backend.data.many("accounts", { npi: ANN })).length, 1);
});

test("one account per NPI holds with two codes sent before either is used", async () => {
  const w = world();
  const a = w.client("10.0.0.3"), b = w.client("10.0.0.4");
  const sa = await a.post("signup", { specialty: "ir", npi: ANN, email: "one@x.example", agree: true }); const ca = w.lastCode("one@x.example");
  const sb = await b.post("signup", { specialty: "ir", npi: ANN, email: "two@y.example", agree: true }); const cb = w.lastCode("two@y.example");
  assert.equal((await a.post("code", { challenge: sa.body.challenge, code: ca })).status, 200);
  const rb = await b.post("code", { challenge: sb.body.challenge, code: cb });
  assert.equal(rb.status, 200); assert.equal(rb.body.claimant, true, "the later one is a claimant");
  assert.equal((await w.backend.data.many("accounts", { npi: ANN })).length, 1);
});

test("levels enforced on the server (job 22): partial edits everything but the photo; full adds the photo and Confirmed", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  assert.equal((await c.put("profile", { blurbs: { ufe: "I perform UFE." }, insurances: ["Aetna"], insurance_other: "Most plans", insurance_confirm: true })).status, 200);
  assert.equal((await c.put("profile", { booking_url: "https://lakesideir.example/book" })).status, 200, "website link on partial");
  assert.equal((await c.put("profile", { offices: [{ practice: "X", street: "1 Test Way", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" }] })).status, 200);
  const ph = await c.call("POST", "photo", new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "Content-Type": "image/jpeg" } });
  assert.equal(ph.status, 403); assert.equal(ph.body.error, "full_needed"); assert.deepEqual(ph.body.fields, ["photo"]);
  let ex = (await exportConfirmed(w.backend))[0];
  assert.equal(ex.confirmed, false); assert.equal(ex.booking_url, "https://lakesideir.example/book"); assert.equal(ex.offices[0].phone, "3125550100");
  await w.idCheck(c);
  assert.equal((await c.get("me")).body.account.level, "full"); assert.equal((await c.get("me")).body.group, "confirmed");
  ex = (await exportConfirmed(w.backend))[0];
  assert.equal(ex.confirmed, true, "full access moves the card to Confirmed");
});

test("check by ID: only result and verified name kept; plan's name rule; only a clear mismatch is an exception", async () => {
  const w = world(), c = await w.signIn(GIL);
  await w.idCheck(c, "GIL", "FOURTEST");
  const me = await c.get("me");
  assert.equal(me.body.account.level, "full"); assert.equal(me.body.account.proof, "identity");
  const row = (await w.backend.data.many("identity_checks"))[0];
  assert.deepEqual(Object.keys(row).sort(), ["account_id", "at", "id", "provider_session", "status", "verified_name"].sort());

  const w2 = world(), c2 = await w2.signIn(GIL);
  await w2.idCheck(c2, "Gilberto", "Fourtest");
  assert.equal((await c2.get("me")).body.account.level, "full", "one first name starts the other: passes");
  assert.equal((await w2.backend.data.many("exceptions")).length, 0);

  const w3 = world(), c3 = await w3.signIn(GIL);
  await w3.idCheck(c3, "Gil", "Fourtest-Smith");
  assert.equal((await c3.get("me")).body.account.level, "basic", "last name must be exact");
  await w3.idCheck(c3, "Gilbert", "Someoneelse");
  assert.equal((await w3.backend.data.many("exceptions", { kind: "name_mismatch" })).length, 2);
});

test("login email: add or change by a code to the new address; the old address is told", async () => {
  const w = world(), c = await w.signIn();
  await w.signIn(GIL, "gil.taken@x.example");
  assert.equal((await c.post("email", { email: "gil.taken@x.example" })).body.error, "email_in_use");
  const s = await c.post("email", { email: "ann.new@x.example" });
  assert.equal(s.status, 202); assert.equal(w.outbox.at(-1).to, "ann.new@x.example");
  assert.equal((await w.client("10.4.4.4").post("code", { challenge: s.body.challenge, code: w.lastCode("ann.new@x.example") })).status, 401, "needs the signed-in account");
  const s2 = await c.post("email", { email: "ann.new@x.example" });
  assert.equal((await c.post("code", { challenge: s2.body.challenge, code: w.lastCode("ann.new@x.example") })).status, 200);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).email, "ann.new@x.example");
  assert.ok(w.outbox.some((m) => m.to === "ann@home.example" && /login email .* changed/.test(m.text)));
  const l = await w.client("10.4.4.5").post("login", { email: "ann.new@x.example" });
  assert.equal((await w.client("10.4.4.5").post("code", { challenge: l.body.challenge, code: w.lastCode("ann.new@x.example") })).status, 200);
});

test("rate limits: sign-up, sign-in and ID check attempts", async () => {
  const w = world(), c = w.client("10.9.9.9");
  let last;
  for (let i = 0; i < 11; i++) last = await c.post("signup", { specialty: "ir", npi: ANN, email: `x${i}@lakesideir.example`, agree: true });
  assert.equal(last.status, 429, "sign-up");
  const l = w.client("10.9.9.8");
  for (let i = 0; i < 6; i++) last = await l.post("login", { email: "same@x.example" });
  assert.equal(last.status, 429, "sign-in");
  const a = await w.signIn(BEN, "ben@home.example", "10.1.1.1");
  for (let i = 0; i < 6; i++) last = await a.post("check/identity");
  assert.equal(last.status, 429, "check attempts");
});

test("writes need same origin and JSON", async () => {
  const w = world(), c = w.client();
  const r = await c.call("POST", "signup", { npi: ANN, email: "a@lakesideir.example", agree: true }, { headers: { Origin: "https://evil.example" } });
  assert.equal(r.status, 403);
  const r2 = await c.call("POST", "login", { email: "a@b.example" }, { headers: { "Content-Type": "text/plain" } });
  assert.equal(r2.status, 415);
});

test("work-email verification is gone: no route, no column, no copy", async () => {
  const { readFileSync } = await import("node:fs");
  const w = world(), c = await w.signIn();
  assert.equal((await c.post("check/email", { work_email: "ann.testone@lakesideir.example" })).status, 404);
  for (const f of ["../lib/accounts/service.mjs", "../lib/accounts/http.mjs", "../supabase/schema.sql", "../site/assets/account.js", "../site/account/index.html"])
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), "utf8"), /work[_ -]?email/i, f);
});
