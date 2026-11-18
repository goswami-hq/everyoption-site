// Job 31 (2026-11-04): his decisions 3A, 5A and 6A, and the new-card alert (ai-hq projects/platform/code-tab-prompt-job-31.md).
// node --test tools/security-job31.test.mjs      Local stand-ins, made-up doctors only. Each test failed before its change.
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, BEN, CARA, EMAIL } from "./accounts-helpers.mjs";
import { onRequestPost as reportPost } from "../functions/api/report.js";
import { connKey } from "../lib/accounts/util.mjs";

const STRANGER = "stranger@elsewhere.example";
const office = { practice: "Made-up Vein Clinic", street: "1 Test Way", city: "Chicago", state: "IL", zip: "60611", phone: "3125550123" };

// ---------------------------------------------------------------- Decision 3A: limits split by who asks
test("3A: a stranger's sign-in requests for a doctor's email do not stop the doctor's own browser", async () => {
  const w = world();
  await w.signIn(BEN, EMAIL[BEN], "198.51.100.7");
  const evil = w.client("203.0.113.9");
  for (let i = 0; i < 6; i++) await evil.post("login", { email: EMAIL[BEN] });
  assert.equal((await evil.post("login", { email: EMAIL[BEN] })).status, 429, "the stranger is still limited");
  const ben = w.client("198.51.100.7");
  const { status, body } = await ben.post("login", { email: EMAIL[BEN] });
  assert.equal(status, 202);
  assert.equal((await ben.post("code", { challenge: body.challenge, code: w.lastCode(EMAIL[BEN]) })).status, 200);
});

test("3A: a stranger's wrong codes do not stop the doctor's right code", async () => {
  const w = world();
  await w.signIn(BEN, EMAIL[BEN], "198.51.100.7");
  const evil = w.client("203.0.113.9");
  for (let i = 0; i < 3; i++) {
    const { body } = await evil.post("login", { email: EMAIL[BEN] });
    for (let k = 0; k < 5; k++) await evil.post("code", { challenge: body.challenge, code: "000000" });
  }
  const ben = w.client("198.51.100.7");
  const { body } = await ben.post("login", { email: EMAIL[BEN] });
  assert.equal((await ben.post("code", { challenge: body.challenge, code: w.lastCode(EMAIL[BEN]) })).status, 200);
});

test("3A: IPv6 addresses in one /64 count as one connection", () => {
  assert.equal(connKey("2001:db8:1:2::a"), connKey("2001:0db8:0001:0002:ffff:1:2:3"));
  assert.notEqual(connKey("2001:db8:1:2::a"), connKey("2001:db8:1:3::a"));
  assert.equal(connKey("203.0.113.9"), "203.0.113.9");
  assert.equal(connKey("::ffff:203.0.113.9"), "203.0.113.9");
});

test("3A: new sign-ups are 3 an hour per connection, and a /64 cannot rotate past it", async () => {
  const w = world();
  const got = [];
  for (let i = 0; i < 4; i++) got.push((await w.client(`2001:db8:5:6::${i + 1}`).post("signup",
    { specialty: "ir", npi: CARA, email: `v${i}@victims.example`, agree: true })).status);
  assert.deepEqual(got, [202, 202, 202, 429]);
});

test("3A: 40 of the 90 daily emails stay for sign-ins to existing accounts", async () => {
  const w = world();
  await w.signIn(BEN, EMAIL[BEN], "198.51.100.7");      // 1 email (sign-up code)
  let sent = 1;
  for (let ip = 1; ip < 40; ip++) {
    const c = w.client(`203.0.113.${ip}`);
    for (let i = 0; i < 3; i++) {
      const r = await c.post("signup", { specialty: "ir", npi: CARA, email: `v${ip}-${i}@victims.example`, agree: true });
      if (r.status === 202) sent++;
    }
  }
  assert.equal(sent, 50, "other emails stop at 50");
  const ben = w.client("198.51.100.7");
  const { status, body } = await ben.post("login", { email: EMAIL[BEN] });
  assert.equal(status, 202, "the doctor still gets a sign-in code");
  assert.equal((await ben.post("code", { challenge: body.challenge, code: w.lastCode(EMAIL[BEN]) })).status, 200);
});

// ---------------------------------------------------------------- Decision 6A (the ID check stays off in production)
test("6A: an ID must carry the exact first name, even for a listing nobody holds", async () => {
  const w = world();
  const c = await w.signIn(ANN, STRANGER);
  const r = await w.idCheck(c, "An", "Testone");
  assert.notEqual(r.level, "full");
  assert.equal((await c.get("me")).body.account.level, "basic");
  assert.equal((await w.backend.data.many("exceptions", { kind: "id_name_not_exact" })).length, 1);
  const ok = await w.idCheck(c, "Ann", "Testone");
  assert.equal(ok.level, "full");
});

// ---------------------------------------------------------------- New-card alert
const settle = () => new Promise((r) => setTimeout(r, 20));
test("alert: a new card alerts when it goes public and on its first details; other saves are contact changes only", async () => {
  const w = world();
  const c = await w.signIn(CARA, STRANGER, "203.0.113.9");
  const kinds = () => ({ card: w.backend.alert.sent.filter((t) => /new public card/.test(t)).length,
    contact: w.backend.alert.sent.filter((t) => /contact change/.test(t)).length, all: w.backend.alert.sent.length });
  assert.equal((await c.post("attest", { procedures: ["ufe"], agree: true })).status, 200); await settle();
  assert.deepEqual(kinds(), { card: 1, contact: 0, all: 1 }, "made");
  assert.equal((await c.put("profile", { offices: [office], booking_url: "https://made-up.example/" })).status, 200); await settle();
  assert.deepEqual(kinds(), { card: 2, contact: 0, all: 2 }, "first details");
  const last = w.backend.alert.sent[1];
  for (const x of ["registry name Cara Newdoc", "partial access", CARA, "UFE", "3125550123", "1 Test Way", "https://made-up.example/"]) assert.ok(last.includes(x), x + " in " + last);
  assert.equal((await c.put("profile", { offices: [{ ...office, phone: "3125550999" }] })).status, 200); await settle();
  assert.equal((await c.post("attest", { procedures: ["pae"], agree: true })).status, 200); await settle();
  assert.deepEqual(kinds(), { card: 2, contact: 1, all: 3 }, "later saves");
  for (const t of w.backend.alert.sent) assert.doesNotMatch(t, /verified|checked|confirmed|proven/i, "the alert implies no check");
  assert.equal((await w.backend.data.many("exceptions", { kind: "new_card" })).length, 2);
});

test("alert: a listed doctor's first procedure is not a new card; an alert failure never holds up the save", async () => {
  const w = world();
  const ann = await w.signIn(ANN, EMAIL[ANN]);
  await ann.post("attest", { procedures: ["ufe"], agree: true }); await settle();
  assert.equal(w.backend.alert.sent.filter((t) => /new public card/.test(t)).length, 0);
  w.backend.alert.fail = true;
  const c = await w.signIn(CARA, STRANGER, "203.0.113.9");
  assert.equal((await c.post("attest", { procedures: ["pae"], agree: true })).status, 200);
  assert.equal((await c.put("profile", { offices: [office] })).status, 200);
});

test("3A: the holder signing up again with their own email draws on the kept sign-in share", async () => {
  const w = world({ env: { emailDailyCap: 9 } });           // 4 kept, 5 other
  await w.signIn(BEN, EMAIL[BEN], "198.51.100.7");          // 1 other
  for (let i = 0; i < 4; i++) await w.client(`203.0.113.${i + 1}`).post("signup", { specialty: "ir", npi: CARA, email: `v${i}@victims.example`, agree: true });
  assert.equal((await w.client("203.0.113.9").post("signup", { specialty: "ir", npi: CARA, email: "late@victims.example", agree: true })).status, 429, "other share used up");
  const r = await w.client("198.51.100.7").post("signup", { specialty: "ir", npi: BEN, email: EMAIL[BEN], agree: true });
  assert.equal(r.status, 202); assert.equal(r.body.signin, true);
});

// ---------------------------------------------------------------- Decision 5A: the report form
function kv() {
  const m = new Map(), puts = [];
  return { m, puts, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v, o) { puts.push({ k, o }); m.set(k, v); } };
}
function atomicHits() {              // stands in for Postgres eo_hit(): one atomic upsert per call
  const n = new Map();
  return async (key, win, max) => { const c = (n.get(key) || 0) + 1; n.set(key, c); await new Promise((r) => setTimeout(r, 1)); return c <= max; };
}
const rep = (i) => ({ submission_id: "s" + i, listing: "1234567893", doctor: "Ann Example", reason: "other", note: "made-up note " + i, email: "", website: "" });
const send = (env, body, ip = "203.0.113.9") => reportPost({ env, request: new Request("http://x/api/report", {
  method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify(body) }) });

test("5A: a report costs 2 storage writes and is deleted after 1 year", async () => {
  const env = { CLAIMS: kv(), __reportHit: atomicHits() };
  assert.equal((await send(env, rep(1))).status, 201);
  assert.equal(env.CLAIMS.puts.length, 2, env.CLAIMS.puts.map((p) => p.k).join(" "));
  const r = env.CLAIMS.puts.find((p) => p.k.startsWith("report:"));
  assert.equal(r.o && r.o.expirationTtl, 365 * 86400);
});

test("5A: reports sent at the same moment from one connection cannot slip past the limit", async () => {
  const env = { CLAIMS: kv(), __reportHit: atomicHits() };
  const res = await Promise.all([...Array(12).keys()].map((i) => send(env, rep(i))));
  assert.equal(res.filter((r) => r.status === 201).length, 5);
  assert.equal([...env.CLAIMS.m.keys()].filter((k) => k.startsWith("report:")).length, 5);
});

test("5A: one /64 is one connection for the report limit", async () => {
  const env = { CLAIMS: kv(), __reportHit: atomicHits() };
  const res = [];
  for (let i = 0; i < 6; i++) res.push((await send(env, rep(i), `2001:db8:9:9::${i + 1}`)).status);
  assert.deepEqual(res, [201, 201, 201, 201, 201, 429]);
});

test("5A: with the database down, the report form still works on the old counter", async () => {
  const env = { CLAIMS: kv(), __reportHit: async () => { throw new Error("db down"); } };
  const res = [];
  for (let i = 0; i < 6; i++) res.push((await send(env, rep(i))).status);
  assert.deepEqual(res, [201, 201, 201, 201, 201, 429]);
});

test("5A: the report page states the address code's true retention", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../site/report/index.html", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /delete from rate_hits where window_start < extract\(epoch from now\(\)\)::bigint - 2 \* 86400/);
  assert.match(page, /internet address is kept for up to 3 days, then deleted/);
});

test("alert: a card withdrawn to empty and added again alerts again as a new card", async () => {
  const w = world();
  const c = await w.signIn(CARA, STRANGER, "203.0.113.9");
  await c.post("attest", { procedures: ["ufe"], agree: true }); await settle();
  await c.post("withdraw", { procedure: "ufe" }); await settle();
  await c.post("attest", { procedures: ["ufe"], agree: true }); await settle();
  assert.equal(w.backend.alert.sent.filter((t) => /new public card for a doctor not already listed, NPI/.test(t)).length, 2);
});
