// node --test tools/taps.test.mjs   (2026-11-21: count doctor-contact taps; ai-hq HQ chat 09:08 CT "Let's build 2 first")
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestPost, onRequest, validate, sameSite } from "../functions/api/tap.js";
import { card } from "../lib/cities.mjs";
import { mergeDoctor, render } from "../lib/directory.mjs";

const NPI = "1234567893";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
function db() {
  const hits = new Map(), taps = [];
  return { hits, taps,
    async hit(key, win, max) { const k = key + "@" + win; const n = (hits.get(k) || 0) + 1; hits.set(k, n); return n <= max; },
    async tap(npi, proc, kind, src) { taps.push([npi, proc, kind, src]); } };
}
const send = (env, body, { ip = "1.2.3.4", origin = "https://everyoptionmd.com", ua = UA, raw } = {}) => onRequestPost({ env,
  request: new Request("https://everyoptionmd.com/api/tap", { method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8", "CF-Connecting-IP": ip, "User-Agent": ua, ...(origin ? { Origin: origin } : {}) },
    body: raw ?? JSON.stringify(body) }) });
const good = { npi: NPI, proc: "ufe", kind: "call", src: "city" };

test("a tap is counted once, and the answer is always 204 with no body", async () => {
  const env = { __tapDb: db() };
  const r = await send(env, good);
  assert.equal(r.status, 204); assert.equal(await r.text(), "");
  assert.deepEqual(env.__tapDb.taps, [[NPI, "ufe", "call", "city"]]);
});

test("the same connection tapping the same doctor's call again that day is not a second count", async () => {
  const env = { __tapDb: db() };
  await send(env, good); await send(env, good);
  assert.equal(env.__tapDb.taps.length, 1);
  await send(env, { ...good, kind: "website" });          // a different kind of tap still counts
  await send(env, good, { ip: "5.6.7.8" });               // and a different connection
  assert.equal(env.__tapDb.taps.length, 3);
});

test("at most 30 counted taps an hour from one connection", async () => {
  const env = { __tapDb: db() };
  const npis = ["1234567893", "1245319599", "1003000126", "1497758544"];
  for (let i = 0; i < 40; i++) await send(env, { ...good, npi: npis[i % 4], kind: ["call", "website", "booking"][i % 3], src: ["finder", "city", "profile"][i % 3] });
  assert.ok(env.__tapDb.taps.length <= 12);   // only 12 distinct doctor-and-kind pairs exist here
  const env2 = { __tapDb: db() };
  env2.__tapDb.hit = async (key) => !key.startsWith("tap_hour:");   // the hourly limit already reached
  await send(env2, good); assert.equal(env2.__tapDb.taps.length, 0);
});

test("nothing about the visitor reaches storage: only NPI, procedure, kind and page type", async () => {
  const env = { __tapDb: db() };
  await send(env, good, { ip: "203.0.113.9" });
  assert.deepEqual(env.__tapDb.taps[0], [NPI, "ufe", "call", "city"]);
  for (const k of env.__tapDb.hits.keys()) assert.ok(!k.includes("203.0.113.9"), "the address is hashed in the limit key");
});

test("bad or foreign taps are not counted", async () => {
  const env = { __tapDb: db() };
  await send(env, { ...good, npi: "1234567890" });           // bad check digit
  await send(env, { ...good, kind: "email" });
  await send(env, { ...good, src: "home" });
  await send(env, { ...good, proc: "knee" });               // not a procedure key
  await send(env, good, { origin: "https://evil.example" });
  await send(env, good, { origin: null });
  await send(env, good, { ua: "Googlebot/2.1 (+http://www.google.com/bot.html)" });
  await send(env, good, { ua: "" });
  await send(env, null, { raw: "not json" });
  assert.equal(env.__tapDb.taps.length, 0);
  const big = await send(env, null, { raw: "x".repeat(600) });
  assert.equal(big.status, 413);
});

test("a profile tap has no procedure; other methods answer 405", async () => {
  const env = { __tapDb: db() };
  await send(env, { npi: NPI, proc: "", kind: "website", src: "profile" });
  assert.deepEqual(env.__tapDb.taps, [[NPI, "", "website", "profile"]]);
  assert.equal((await onRequest()).status, 405);
});

test("no database configured, or the database fails: 204 and nothing breaks", async () => {
  assert.equal((await send({}, good)).status, 204);
  const env = { __tapDb: { async hit() { throw new Error("down"); }, async tap() { throw new Error("down"); } } };
  assert.equal((await send(env, good)).status, 204);
});

test("validate and sameSite", () => {
  assert.deepEqual(validate(good), good);
  assert.equal(validate({ ...good, npi: 1234567893 }), null);
  assert.ok(sameSite(new Request("http://localhost:8799/api/tap", { method: "POST", headers: { Origin: "http://localhost:8799" } })));
  assert.ok(!sameSite(new Request("https://everyoptionmd.com/api/tap", { method: "POST", headers: { Origin: "https://everyoptionmd.com.evil.example" } })));
});

test("city cards and profiles carry what the counter reads", () => {
  const p = { npi: NPI, name: "Ann Example", city: "Chicago", state: "IL", phone: "312-555-0100", url: "https://example.org/ann",
    miles: 3, confirmed: false, offices: [] };
  const c = card(p, "ufe");
  assert.match(c, new RegExp(`<li class="card" data-npi="${NPI}" data-proc="ufe" data-src="city">`));
  const d = mergeDoctor(NPI, null, { ufe: { removed: [], people: [{ npi: NPI, name: "Ann Example", confirmed: true, offices: [
    { practice: "Clinic", street: "1 Main St", city: "Chicago", state: "IL", zip: "60611", phone: "312-555-0100", lat: 41, lon: -87 }],
    booking_url: "https://example.org/book", insurances: [], photo: "" }] } });
  const html = render(NPI, d);
  assert.match(html, new RegExp(`<div class="actions" data-npi="${NPI}" data-src="profile">`));
  assert.match(html, new RegExp(`<ul class="dir-offices" data-npi="${NPI}" data-src="profile">`));
});

test("the finder's cards carry the same attributes, and the page script stays first-party", () => {
  const finder = readFileSync(new URL("../src-assets/finder.js", import.meta.url), "utf8");
  assert.match(finder, /"data-npi": p\.npi, "data-proc": PROC, "data-src": "finder"/);
  const taps = readFileSync(new URL("../src-assets/taps.js", import.meta.url), "utf8");
  assert.match(taps, /sendBeacon\("\/api\/tap"/);
  assert.ok(!/https?:\/\//.test(taps.replace(/^\/\/.*$/gm, "")), "no outside address in the script");
  assert.ok(!/cookie|localStorage|sessionStorage/i.test(taps.replace(/^\/\/.*$/gm, "")), "no cookie or stored ID");
});

test("schema and migration agree on the table and the function", () => {
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const mig = readFileSync(new URL("../supabase/migrations/2026-11-21-contact-taps.sql", import.meta.url), "utf8");
  const cols = (s) => /create table (?:if not exists )?contact_taps \(([\s\S]*?)\n\);/.exec(s)[1].replace(/\s+/g, " ").trim();
  assert.equal(cols(schema), cols(mig));
  for (const s of [schema, mig]) {
    assert.match(s, /on conflict \(day, npi, proc, kind, src\) do update set n = contact_taps\.n \+ 1/);
    assert.match(s, /revoke all on function eo_tap\(text, text, text, text\) from public, anon, authenticated/);
  }
  assert.match(schema, /'hidden_profiles','contact_taps'\] loop/);
  assert.match(mig, /force row level security/);
});
