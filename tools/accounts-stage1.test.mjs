// Stage 1: accounts and claiming. node --test tools/accounts-stage1.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, BEN, GIL } from "./accounts-helpers.mjs";
import { handle } from "../lib/accounts/http.mjs";

test("no backend connected: every account route says not open and stores nothing", async () => {
  for (const [m, p] of [["GET", "status"], ["POST", "signup"], ["POST", "login"], ["POST", "link"], ["GET", "me"]]) {
    const r = await handle(new Request("http://x/api/account/" + p, { method: m,
      ...(m === "POST" ? { body: JSON.stringify({ npi: ANN, email: "a@b.co", accept_terms: true }), headers: { "Content-Type": "application/json" } } : {}) }), {});
    assert.equal(r.status, 503, p);
    assert.equal((await r.json()).error, "not_open");
  }
});

test("status when open", async () => {
  const w = world(); const r = await w.client().get("status");
  assert.equal(r.status, 200); assert.equal(r.body.open, true); assert.equal(r.body.doximity, false);
});

test("sign-up: valid NPI, terms required, name from NPPES, login link by email, no password", async () => {
  const w = world(), c = w.client();
  assert.equal((await c.post("signup", { npi: ANN, email: "ann@lakesideir.example" })).status, 400, "terms not accepted");
  assert.equal((await c.post("signup", { npi: "1999000010", email: "ann@lakesideir.example", accept_terms: true })).status, 400, "bad check digit");
  const r = await c.post("signup", { npi: ANN, email: "ann@lakesideir.example", accept_terms: true, password: "x" });
  assert.equal(r.status, 202);
  assert.equal(w.outbox.length, 1); assert.equal(w.outbox[0].to, "ann@lakesideir.example");
  assert.equal((await w.backend.data.many("accounts")).length, 0, "no account until the link is used");
  const u = await c.post("link", { token: w.lastLink() });
  assert.equal(u.status, 200);
  const acct = (await w.backend.data.many("accounts"))[0];
  assert.equal(acct.name, "Ann Testone"); assert.equal(acct.npi, ANN); assert.equal(acct.status, "unverified");
  assert.ok(acct.terms_version && acct.terms_accepted_at);
  assert.ok(!JSON.stringify(acct).includes("password"));
  const me = await c.get("me"); assert.equal(me.status, 200); assert.equal(me.body.account.npi, ANN);
});

test("login links: expire after 15 minutes, work once, stored only as a hash", async () => {
  const w = world(), c = w.client();
  await c.post("signup", { npi: ANN, email: "ann@lakesideir.example", accept_terms: true });
  const tok = w.lastLink();
  const rows = await w.backend.data.many("login_links");
  assert.ok(!JSON.stringify(rows).includes(tok), "raw token not stored");
  w.clock.t += 16 * 60 * 1000;
  assert.equal((await c.post("link", { token: tok })).status, 400, "expired");
  await c.post("signup", { npi: ANN, email: "ann@lakesideir.example", accept_terms: true });
  const t2 = w.lastLink();
  assert.equal((await c.post("link", { token: t2 })).status, 200);
  assert.equal((await w.client("10.0.0.9").post("link", { token: t2 })).status, 400, "second use");
  await c.post("logout");
  assert.equal((await c.get("me")).status, 401);
  await c.post("login", { email: "ann@lakesideir.example" });
  const t3 = w.lastLink();
  assert.equal((await c.post("link", { token: t3 })).status, 200);
  assert.equal((await c.get("me")).status, 200);
});

test("login does not say whether an email has an account", async () => {
  const w = world(); await w.signIn();
  const a = await w.client().post("login", { email: "ann@lakesideir.example" });
  const b = await w.client().post("login", { email: "nobody@else.example" });
  assert.equal(a.status, b.status); assert.deepEqual(a.body, b.body);
  assert.equal(w.outbox.filter((m) => m.to === "nobody@else.example").length, 0);
});

test("sessions: cookie is HttpOnly, Secure, SameSite=Strict; expired session is refused", async () => {
  const w = world(), c = w.client();
  await c.post("signup", { npi: ANN, email: "ann@lakesideir.example", accept_terms: true });
  const r = await c.call("POST", "link", { token: w.lastLink() });
  const sc = r.headers.get("Set-Cookie");
  for (const f of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/account"]) assert.ok(sc.includes(f), f);
  w.clock.t += 13 * 3600 * 1000;
  assert.equal((await c.get("me")).status, 401);
});

test("one account per NPI: a second claimant goes to the exceptions list, gets the same answer, no account", async () => {
  const w = world(); await w.signIn();
  const c2 = w.client("10.0.0.2");
  const r = await c2.post("signup", { npi: ANN, email: "someone@other.example", accept_terms: true });
  assert.equal(r.status, 202);
  assert.equal(w.outbox.filter((m) => m.to === "someone@other.example").length, 0, "no link sent");
  const ex = await w.backend.data.many("exceptions", { kind: "second_claimant" });
  assert.equal(ex.length, 1); assert.equal(ex[0].npi, ANN);
  assert.equal((await w.backend.data.many("accounts", { npi: ANN })).length, 1);
});

test("one account per NPI holds even with two links sent before either is used", async () => {
  const w = world();
  const a = w.client("10.0.0.3"), b = w.client("10.0.0.4");
  await a.post("signup", { npi: ANN, email: "one@x.example", accept_terms: true }); const ta = w.lastLink("one@x.example");
  await b.post("signup", { npi: ANN, email: "two@y.example", accept_terms: true }); const tb = w.lastLink("two@y.example");
  assert.equal((await a.post("link", { token: ta })).status, 200);
  const rb = await b.post("link", { token: tb });
  assert.equal(rb.status, 409);
  assert.equal((await w.backend.data.many("accounts", { npi: ANN })).length, 1);
  assert.equal((await w.backend.data.many("exceptions", { kind: "second_claimant" })).length, 1);
});

test("check by work email: domain must match a page on the listing; free mail and directories never count", async () => {
  const w = world(), c = await w.signIn();
  assert.equal((await c.post("check/email", { work_email: "ann@gmail.com" })).status, 400);
  assert.equal((await c.post("check/email", { work_email: "ann@other-hospital.example" })).status, 400);
  const ok = await c.post("check/email", { work_email: "a.testone@mail.lakesideir.example" });
  assert.equal(ok.status, 202);
  const r = await c.post("link", { token: w.lastLink("a.testone@mail.lakesideir.example") });
  assert.equal(r.status, 200);
  const me = await c.get("me");
  assert.equal(me.body.account.status, "verified"); assert.equal(me.body.account.verified_method, "work_email");

  const w2 = world(), c2 = await w2.signIn(BEN, "ben@healthgrades.com");
  assert.equal((await c2.post("check/email", { work_email: "ben@healthgrades.com" })).status, 400, "directory domain");
});

test("check by ID: only result and verified name kept; name matched to NPPES; mismatch goes to exceptions", async () => {
  const w = world(), c = await w.signIn(GIL, "gil@home.example");
  const s = await c.post("check/identity");
  assert.equal(s.status, 200); assert.ok(s.body.url);
  const sess = (await w.backend.data.many("identity_checks"))[0].provider_session;
  await w.env.backend.identity.complete(sess, { status: "verified", first: "GIL", last: "FOURTEST" });
  await handleResult(w, sess);
  const me = await c.get("me");
  assert.equal(me.body.account.status, "verified"); assert.equal(me.body.account.verified_method, "identity");
  const row = (await w.backend.data.many("identity_checks"))[0];
  assert.deepEqual(Object.keys(row).sort(), ["account_id", "at", "id", "provider_session", "status", "verified_name"].sort());

  const w2 = world(), c2 = await w2.signIn(GIL, "gil@home.example");
  await c2.post("check/identity");
  const s2 = (await w2.backend.data.many("identity_checks"))[0].provider_session;
  await w2.env.backend.identity.complete(s2, { status: "verified", first: "Gilbert", last: "Someoneelse" });
  await handleResult(w2, s2);
  assert.equal((await c2.get("me")).body.account.status, "unverified");
  assert.equal((await w2.backend.data.many("exceptions", { kind: "name_mismatch" })).length, 1);
});

async function handleResult(w, session) {
  const r = await handle(new Request("http://localhost:8787/api/account/identity/result", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session, ...w.backend.identity.sessions.get(session) }) }), w.env);
  assert.equal(r.status, 200);
}

test("attest: only once verified; per procedure; exact wording kept; enters the confirmed group", async () => {
  const w = world(), c = await w.signIn();
  assert.equal((await c.post("attest", { procedures: ["ufe"], agree: true })).status, 403, "not verified");
  await w.verifyByEmail(c, "ann@lakesideir.example");
  assert.equal((await c.post("attest", { procedures: ["ufe"] })).status, 400, "must tick the statement");
  const r = await c.post("attest", { procedures: ["ufe", "pae", "xyz"], agree: true });
  assert.equal(r.status, 200);
  const at = await w.backend.data.many("attestations", { npi: ANN });
  assert.deepEqual(at.map((a) => a.procedure).sort(), ["pae", "ufe"]);
  assert.match(at[0].statement, /I personally perform/);
  const exp = await (await import("../lib/accounts/service.mjs")).exportConfirmed(w.backend);
  assert.equal(exp.length, 1); assert.deepEqual(exp[0].procedures.sort(), ["pae", "ufe"]); assert.equal(exp[0].npi, ANN);
});

test("rate limits: sign-up, login and check attempts", async () => {
  const w = world(), c = w.client("10.9.9.9");
  let last;
  for (let i = 0; i < 6; i++) last = await c.post("signup", { npi: ANN, email: `x${i}@lakesideir.example`, accept_terms: true });
  assert.equal(last.status, 429, "sign-up");
  const l = w.client("10.9.9.8");
  for (let i = 0; i < 6; i++) last = await l.post("login", { email: "same@x.example" });
  assert.equal(last.status, 429, "login");
  const a = await w.signIn(ANN, "ann@lakesideir.example", "10.1.1.1");
  for (let i = 0; i < 6; i++) last = await a.post("check/email", { work_email: "ann@gmail.com" });
  assert.equal(last.status, 429, "check attempts");
  w.clock.t += 25 * 3600 * 1000;
  assert.equal((await a.post("check/email", { work_email: "ann@gmail.com" })).status, 401, "session expired by now; limit itself is daily");
});

test("writes need same origin and JSON", async () => {
  const w = world(), c = w.client();
  const r = await c.call("POST", "signup", { npi: ANN, email: "a@lakesideir.example", accept_terms: true }, { headers: { Origin: "https://evil.example" } });
  assert.equal(r.status, 403);
  const r2 = await c.call("POST", "login", { email: "a@b.example" }, { headers: { "Content-Type": "text/plain" } });
  assert.equal(r2.status, 415);
});
