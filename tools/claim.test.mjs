// node --test tools/claim.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, validate, npiOk } from "../functions/api/claim.js";

function kv() {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); } };
}
const good = { submission_id: "s1", role: "doctor", name: "Ann Example", npi: "1234567893", email: "ann@example.org",
  procedures: ["ufe", "pae"], practice: "Lakeside IR", city: "Chicago", state: "IL", note: "", listing: "1234567893", website: "" };
const post = (env, body, ip = "1.2.3.4", raw) => onRequestPost({ env, request: new Request("http://x/api/claim", {
  method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: raw ?? JSON.stringify(body) }) });

test("NPI check digit", () => { assert.ok(npiOk("1234567893")); assert.ok(!npiOk("1234567890")); assert.ok(!npiOk("12345")); });
test("no store bound: 503, nothing stored", async () => { const r = await post({}, good); assert.equal(r.status, 503); });
test("stores a pending, not-live record", async () => {
  const env = { CLAIMS: kv() }; const r = await post(env, good); assert.equal(r.status, 201);
  const keys = [...env.CLAIMS.m.keys()].filter((k) => k.startsWith("claim:")); assert.equal(keys.length, 1);
  const rec = JSON.parse(env.CLAIMS.m.get(keys[0])); assert.equal(rec.status, "pending review"); assert.equal(rec.live, false);
  assert.ok(!JSON.stringify(rec).includes("1.2.3.4"), "raw IP never stored");
  assert.ok(!("ip_hash" in rec), "no IP hash in the claim record");
});
test("same submission id twice: one record", async () => {
  const env = { CLAIMS: kv() }; await post(env, good); const r = await post(env, good);
  assert.equal(r.status, 200); assert.equal((await r.json()).duplicate, true);
  assert.equal([...env.CLAIMS.m.keys()].filter((k) => k.startsWith("claim:")).length, 1);
});
test("same content, new id: one record", async () => {
  const env = { CLAIMS: kv() }; await post(env, good); await post(env, { ...good, submission_id: "s2" });
  assert.equal([...env.CLAIMS.m.keys()].filter((k) => k.startsWith("claim:")).length, 1);
});
test("rate limit: 6th in an hour is 429", async () => {
  const env = { CLAIMS: kv() }; let last;
  for (let i = 0; i < 6; i++) last = await post(env, { ...good, submission_id: "r" + i, note: "n" + i });
  assert.equal(last.status, 429);
});
test("size cap: over 8 KB is 413", async () => {
  const r = await post({ CLAIMS: kv() }, null, "1.1.1.1", JSON.stringify({ ...good, note: "x".repeat(9000) })); assert.equal(r.status, 413);
});
test("bad fields: 400 with names", async () => {
  const r = await post({ CLAIMS: kv() }, { ...good, email: "nope", npi: "1234567890", state: "Illinois" });
  assert.equal(r.status, 400); const j = await r.json();
  for (const f of ["email", "npi", "state"]) assert.ok(j.fields.includes(f), f);
});
test("bad JSON: 400", async () => { const r = await post({ CLAIMS: kv() }, null, "9.9.9.9", "{nope"); assert.equal(r.status, 400); });
test("honeypot: answers ok, stores nothing", async () => {
  const env = { CLAIMS: kv() }; const r = await post(env, { ...good, website: "spam.example" });
  assert.equal(r.status, 200); assert.equal(env.CLAIMS.m.size, 0);
});
test("store failure: 500 and an error line without details", async () => {
  const m = kv(); let n = 0; const env = { CLAIMS: { ...m, get: m.get, async put(k, v) { if (k.startsWith("claim:")) throw new Error("kv down"); n++; return m.put(k, v); } } };
  const r = await post(env, good); assert.equal(r.status, 500);
  const errs = [...m.m.entries()].filter(([k]) => k.startsWith("err:")); assert.equal(errs.length, 1);
  assert.ok(!errs[0][1].includes("ann@example.org"));
});
test("unknown procedures dropped", () => { assert.deepEqual(validate({ ...good, procedures: ["ufe", "x"] }).clean.procedures, ["ufe"]); });
