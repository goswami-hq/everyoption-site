// Reviewer round 1 fixes (2026-11-01). node --test tools/accounts-review1.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, BEN, GIL } from "./accounts-helpers.mjs";
import { verifyStripe, stripeIdentity, doximityOAuth } from "../lib/accounts/vendors.mjs";

test("2: failed ID checks are redacted too; a new check cancels the pending one; a failed redact is an exception", async () => {
  const w = world(), c = await w.signIn(GIL);
  await c.post("check/identity");
  const s1 = (await w.backend.data.many("identity_checks"))[0].provider_session;
  await c.post("check/identity");
  assert.ok(w.backend.identity.cancelled.includes(s1), "earlier pending session cancelled and redacted");
  assert.equal((await w.backend.data.one("identity_checks", { provider_session: s1 })).status, "cancelled");
  const now = Date.parse("2026-11-01T12:00:00Z"), t = now / 1000;
  const calls = [];
  const fetchFn = async (url, init = {}) => { calls.push(url); return new Response(url.endsWith("/redact") ? "{}" : "{}", { status: url.endsWith("/redact") ? 500 : 200 }); };
  const id = stripeIdentity("sk", "whsec", fetchFn);
  const raw = JSON.stringify({ type: "identity.verification_session.requires_input", data: { object: { id: "vs_9" } } });
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${raw}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const out = await id.parseResult(new Request("https://x", { method: "POST", body: raw, headers: { "Stripe-Signature": `t=${t},v1=${sig}` } }), { now: () => now });
  assert.equal(out.status, "failed"); assert.ok(calls.some((u) => u.endsWith("vs_9/redact"))); assert.equal(out.redact_failed, true);
  w.backend.identity.sessions.set("vs_x", { accountId: (await w.backend.data.one("accounts", { npi: GIL })).id, status: "pending" });
  await w.backend.data.insert("identity_checks", { account_id: (await w.backend.data.one("accounts", { npi: GIL })).id, provider_session: "vs_x", status: "pending", verified_name: null, at: "x" });
  const svcMod = await import("../lib/accounts/service.mjs");
  await svcMod.makeService(w.backend, w.env).identityResult({ session: "vs_x", status: "failed", redact_failed: true });
  assert.equal((await w.backend.data.many("exceptions", { kind: "redact_failed" })).length, 1);
});

test("3: Doximity uses PKCE (S256 challenge on the way out, verifier on the token exchange)", async () => {
  const calls = [];
  const f = async (url, init = {}) => { calls.push({ url, init }); return new Response(JSON.stringify(url.includes("token") ? { access_token: "a" } : { sub: "d1", given_name: "Ann", family_name: "Testone" })); };
  const d = doximityOAuth({ DOXIMITY_AUTHORIZE_URL: "https://auth.doximity.com/oauth/authorize", DOXIMITY_TOKEN_URL: "https://auth.doximity.com/oauth/token",
    DOXIMITY_PROFILE_URL: "https://auth.doximity.com/oauth/userinfo", DOXIMITY_CLIENT_ID: "c", DOXIMITY_CLIENT_SECRET: "s", DOXIMITY_REDIRECT_URI: "https://x/cb" }, f);
  const verifier = "v".repeat(50);
  const u = new URL(await d.authorizeUrl("st", verifier));
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  const want = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(u.searchParams.get("code_challenge"), want);
  const p = await d.profile("code1", verifier);
  assert.match(calls[0].init.body, new RegExp("code_verifier=" + verifier));
  assert.deepEqual([p.id, p.first, p.last], ["d1", "Ann", "Testone"]);
});

test("4: per-email sign-up limit and a daily cap on all email", async () => {
  const w = world();
  let last;
  for (let i = 0; i < 4; i++) last = await w.client("10.7.0." + i).post("signup", { npi: [ANN, BEN, GIL, ANN][i], email: "target@x.example", agree: true });
  assert.equal(last.status, 429, "same inbox from several connections");
  const w2 = world({ env: { emailDailyCap: 3 } });
  for (let i = 0; i < 3; i++) await w2.client("10.8.0." + i).post("login", { email: `n${i}@x.example` }); // no accounts: no sends
  for (let i = 0; i < 3; i++) assert.equal((await w2.client("10.8.1." + i).post("signup", { npi: [ANN, BEN, GIL][i], email: `s${i}@x.example`, agree: true })).status, 202);
  assert.equal((await w2.client("10.8.2.2").post("signup", { npi: ANN, email: "s9@x.example", agree: true })).status, 429);
  assert.equal(w2.outbox.length, 3);
  assert.equal((await w2.backend.data.many("exceptions", { kind: "email_cap" })).length, 1);
});

test("6: a Doximity link token works only in the browser that started it, and only after a confirm", async () => {
  const w = world({ doximity: true });
  const victim = await w.signIn(ANN);
  const attacker = w.client("10.6.6.6");
  const s = await attacker.call("GET", "doximity/start");
  const state = new URL(s.headers.get("Location"), "http://x").searchParams.get("state");
  const code = w.backend.doximity.grant({ id: "dx-evil", first: "Ann", last: "Testone" });
  const cb = await attacker.call("GET", `doximity/callback?code=${code}&state=${state}`);
  const tok = /#doximity=([0-9a-f]{64})$/.exec(cb.headers.get("Location"))[1];
  const r = await victim.post("doximity/link", { token: tok });
  assert.equal(r.status, 403, "token from another browser refused");
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).doximity_id, null);
  const pv = await attacker.post("doximity/preview", { token: tok });
  assert.equal(pv.status, 200); assert.equal(pv.body.name, "Ann Testone");
});

test("7: an NPPES outage after the code is sent does not burn it", async () => {
  const w = world(), c = w.client();
  const s = await c.post("signup", { npi: ANN, email: "ann@home.example", agree: true });
  w.backend.nppes = { async lookup() { throw new Error("nppes down"); } };
  assert.equal((await c.post("code", { challenge: s.body.challenge, code: w.lastCode() })).status, 200);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).name, "Ann Testone");
});

test("8: Stripe webhook accepted when any of several v1 signatures matches (secret rotation)", async () => {
  const now = Date.parse("2026-11-01T12:00:00Z"), t = now / 1000, raw = "{}";
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("new"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const good = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${raw}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  assert.equal(await verifyStripe(raw, `t=${t},v1=${good},v1=${"0".repeat(64)}`, "new", now), true);
  assert.equal(await verifyStripe(raw, `t=${t},v1=${"0".repeat(64)},v1=${good}`, "new", now), true);
});

test("9: a malformed edit id is not found, not a server error", async () => {
  const w = world(), c = await w.full();
  for (const id of ["nope", "'; drop table edits; --", 123])
    assert.equal((await c.post("undo", { edit_id: id })).status, 404);
});

// ---- Reviewer round 2 (2026-11-01) ----

test("r2-1: a replaced pending ID check is redacted directly (Stripe refuses redacting a cancelled one)", async () => {
  const calls = [], state = { s: "requires_input" };
  const f = async (url, init = {}) => {
    calls.push(url);
    if (url.endsWith("/cancel")) { state.s = "canceled"; return new Response("{}"); }
    if (url.endsWith("/redact")) return new Response("{}", { status: state.s === "canceled" ? 400 : 200 });
    if (/vs_p$/.test(url)) return new Response(JSON.stringify({ status: state.s }));
    return new Response("{}");
  };
  const id = stripeIdentity("sk", "wh", f);
  assert.equal(await id.cancel("vs_p"), true);
  assert.ok(!calls.some((u) => u.endsWith("/cancel")), "no cancel before redact");
  const busy = stripeIdentity("sk", "wh", async (url) => new Response(JSON.stringify({ status: "processing" }), { status: url.endsWith("/redact") ? 400 : 200 }));
  assert.equal(await busy.cancel("vs_q"), "processing", "processing: left to the webhook, not an exception");
});
