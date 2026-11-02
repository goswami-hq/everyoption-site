// Adapters and schema: node --test tools/accounts-adapters.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { supabaseData, supabasePhotos } from "../lib/accounts/supabase.mjs";
import { backendFrom, missing, REQUIRED } from "../lib/accounts/backend.mjs";
import { verifyStripe, stripeIdentity, nppesRegistry } from "../lib/accounts/vendors.mjs";
import { onRequest } from "../functions/api/account/[[path]].js";

const SQL = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

function fakeFetch(answers) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), ...init });
    const a = answers.shift() || { status: 200, body: [] };
    return new Response(a.raw ?? JSON.stringify(a.body), { status: a.status || 200, headers: a.headers || {} });
  };
  f.calls = calls;
  return f;
}

test("Pages route with no configuration: 503 not open", async () => {
  const r = await onRequest({ request: new Request("https://x/api/account/status"), env: { SUPABASE_URL: "https://a.supabase.co" } });
  assert.equal(r.status, 503);
});

test("backend needs every variable and ACCOUNTS_OPEN=yes", () => {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, "set"]));
  env.ASSETS = { fetch: async () => new Response("{}") };
  assert.equal(backendFrom(env), null);
  assert.ok(missing(env).includes("ACCOUNTS_OPEN=yes"));
  env.ACCOUNTS_OPEN = "yes";
  const b = backendFrom(env);
  assert.equal(b.kind, "supabase"); assert.equal(b.doximity, null, "Doximity off unless switched on");
  delete env.STRIPE_SECRET_KEY; assert.equal(backendFrom(env), null);
});

test("Supabase data adapter: request shapes, service key in headers only, conflict mapped", async () => {
  const f = fakeFetch([{ body: [{ id: "u1", npi: "1" }] }, { body: [] }, { status: 409, body: {} }, { body: true }, { body: [{ id: "l1" }] }]);
  const d = supabaseData("https://p.supabase.co/", "svc-key", f);
  assert.deepEqual(await d.insert("accounts", { id: "ignored", npi: "1" }), { id: "u1", npi: "1" });
  assert.equal(f.calls[0].url, "https://p.supabase.co/rest/v1/accounts");
  assert.equal(f.calls[0].headers.Prefer, "return=representation");
  assert.ok(!f.calls[0].body.includes("ignored"), "database makes ids");
  assert.equal(await d.one("accounts", { npi: "1999000015", revoked_at: null }), null);
  assert.match(f.calls[1].url, /accounts\?select=\*&npi=eq\.1999000015&revoked_at=is\.null&limit=1$/);
  await assert.rejects(d.insert("accounts", { npi: "1" }), (e) => e.code === "conflict");
  assert.equal(await d.hit("k", 60, 5), true);
  assert.match(f.calls[3].url, /rpc\/eo_hit$/);
  assert.deepEqual(await d.consumeLink("h"), { id: "l1" });
  for (const c of f.calls) { assert.equal(c.headers.apikey, "svc-key"); assert.ok(!c.url.includes("svc-key")); }
});

test("Supabase photos adapter: private bucket path, upsert", async () => {
  const f = fakeFetch([{ body: {} }]);
  await supabasePhotos("https://p.supabase.co", "k", f).put("1999000015/a.jpg", new Uint8Array([1]), "image/jpeg");
  assert.equal(f.calls[0].url, "https://p.supabase.co/storage/v1/object/photos/1999000015%2Fa.jpg");
  assert.equal(f.calls[0].headers["x-upsert"], "true");
});

async function sign(raw, secret, t) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${raw}`)));
  return `t=${t},v1=${[...s].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

test("Stripe webhook: signature and age checked; verified result keeps the name only, then redacts", async () => {
  const now = Date.parse("2026-11-01T12:00:00Z"), t = now / 1000;
  const raw = JSON.stringify({ type: "identity.verification_session.verified", data: { object: { id: "vs_1" } } });
  assert.equal(await verifyStripe(raw, await sign(raw, "whsec", t), "whsec", now), true);
  assert.equal(await verifyStripe(raw, await sign(raw, "other", t), "whsec", now), false);
  assert.equal(await verifyStripe(raw, await sign(raw, "whsec", t - 600), "whsec", now), false, "too old");
  const f = fakeFetch([{ body: { verified_outputs: { first_name: "Gil", last_name: "Fourtest", dob: { year: 1970 }, id_number: "x" } } }, { body: {} }]);
  const id = stripeIdentity("sk", "whsec", f);
  const req = new Request("https://x/api/account/identity/result", { method: "POST", body: raw, headers: { "Stripe-Signature": await sign(raw, "whsec", t) } });
  const out = await id.parseResult(req, { now: () => now });
  assert.deepEqual(out, { session: "vs_1", status: "verified", first: "Gil", last: "Fourtest", redact_failed: false });
  assert.match(f.calls[1].url, /vs_1\/redact$/);
  const bad = new Request("https://x", { method: "POST", body: raw, headers: { "Stripe-Signature": "t=1,v1=00" } });
  assert.equal(await id.parseResult(bad, { now: () => now }), null);
});

test("NPPES adapter maps an individual's name and primary taxonomy", async () => {
  const f = fakeFetch([{ body: { results: [{ enumeration_type: "NPI-1", basic: { first_name: "ANN", last_name: "TESTONE" },
    taxonomies: [{ code: "207R00000X", desc: "Internal Medicine", primary: false }, { code: "2085R0204X", desc: "Radiology, Vascular & Interventional Radiology", primary: true }] }] } }]);
  const p = await nppesRegistry(f).lookup("1999000015");
  assert.equal(p.taxonomy, "2085R0204X"); assert.equal(p.first, "ANN");
  assert.match(f.calls[0].url, /^https:\/\/npiregistry\.cms\.hhs\.gov\/api\/\?version=2\.1&number=1999000015$/);
});

test("schema: row level security on for every table; no patient fields", () => {
  const tables = [...SQL.matchAll(/create table (\w+)/g)].map((m) => m[1]);
  const rls = SQL.match(/array\[([^\]]+)\]/)[1].replace(/['\s]/g, "").split(",");
  assert.deepEqual([...tables].sort(), [...rls].sort());
  assert.doesNotMatch(SQL.replace(/--.*$/gm, ""), /\b(patient|diagnosis|dob|date_of_birth|mrn|ssn|id_image|selfie)\b/i);
});

export function schemaColumns() {
  const out = {};
  for (const m of SQL.matchAll(/create table (\w+) \(([\s\S]*?)\n\);/g))
    out[m[1]] = [...m[2].matchAll(/^\s+(\w+)\s+(?:uuid|text|boolean|jsonb|timestamptz|bigint|integer)/gm)].map((x) => x[1]);
  return out;
}
