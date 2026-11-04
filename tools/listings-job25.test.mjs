// Job 25: account changes appear live on the finder. node --test tools/listings-job25.test.mjs
// His words (2026-11-03): "I want live"; "yes a doctors removal should take them off the list".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { world, ANN, BEN, GIL, EMAIL } from "./accounts-helpers.mjs";
import { handlePublic, overlayFor, contactChanges, zipCenters, resetForTests } from "../lib/accounts/listings.mjs";
import vm from "node:vm";
import { supabaseData } from "../lib/accounts/supabase.mjs";
import { telegramAlert } from "../lib/accounts/vendors.mjs";

const CARA = "1999000031";
const ROOT = new URL("../site/", import.meta.url);
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, ROOT)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
let ipN = 0;
async function get(w, path, extra = {}) {
  resetForTests();
  const r = await handlePublic(new Request("http://localhost:8787" + path, { headers: { "CF-Connecting-IP": `10.25.0.${++ipN % 250}` } }),
    { backend: w.backend, noCache: true, ASSETS, ...extra });
  let body = null; try { body = await r.clone().json(); } catch (_) {}
  return { status: r.status, body, headers: r.headers, r };
}
function pngBytes(w = 160, h = 160) {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 120)])));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
const OFF = { practice: "Lakeside IR", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" };
const settle = () => new Promise((r) => setTimeout(r, 5));

test("allow-list: only public fields; never email, proof, history or waitlist", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  await c.put("profile", { offices: [OFF], booking_url: "https://lakeside.example/", insurances: ["Medicare"], blurbs: { ufe: "Same-week visits." } });
  const r = await get(w, "/api/listings?procedure=ufe");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Cache-Control"), /public, max-age=60/);
  assert.equal(r.headers.get("Set-Cookie"), null);
  assert.deepEqual(Object.keys(r.body).sort(), ["people", "procedure", "removed"]);
  const p = r.body.people[0];
  assert.deepEqual(Object.keys(p).sort(), ["blurb", "booking_url", "confirmed", "insurance_confirm", "insurance_other", "insurances",
    "name", "npi", "offices", "photo"]);
  assert.deepEqual(Object.keys(p.offices[0]).sort(), ["city", "geo", "lat", "lon", "phone", "practice", "state", "street", "zip"]);
  const text = JSON.stringify(r.body);
  for (const bad of [EMAIL[ANN], "proof", "attest", "level", "account_id", "waitlist", "terms", "edits"]) assert.ok(!text.includes(bad), bad);
  assert.equal(p.blurb, "Same-week visits.");
  assert.equal((await get(w, "/api/listings?procedure=nope")).status, 400);
  assert.equal((await get(w, "/api/listings")).status, 400);
});

test("partial stays out of Confirmed with no photo; full is confirmed with its public photo address", async () => {
  const w = world(), c = await w.signIn(BEN, EMAIL[BEN], undefined, ["gae"]);
  let p = (await get(w, "/api/listings?procedure=gae")).body.people.find((x) => x.npi === BEN);
  assert.equal(p.confirmed, false); assert.equal(p.photo, "");
  const f = await w.full(ANN);
  const up = await f.call("POST", "photo", pngBytes(), { headers: { "Content-Type": "image/png" } });
  assert.equal(up.status, 200);
  p = (await get(w, "/api/listings?procedure=ufe")).body.people.find((x) => x.npi === ANN);
  assert.equal(p.confirmed, true);
  assert.match(p.photo, /^\/api\/photo\/1999000015-[0-9a-f]{16}\.png$/);
});

test("public photo: only a full-access doctor's current photo; old, wrong or partial gives 404", async () => {
  const w = world(), f = await w.full(ANN);
  await f.call("POST", "photo", pngBytes(), { headers: { "Content-Type": "image/png" } });
  const url = (await get(w, "/api/listings?procedure=ufe")).body.people[0].photo;
  const r = await get(w, url);
  assert.equal(r.status, 200); assert.equal(r.headers.get("Content-Type"), "image/png");
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal((await get(w, url.replace(/-[0-9a-f]+\./, "-0123456789abcdef."))).status, 404, "guessed id");
  assert.equal((await get(w, "/api/photo/1999000015-abc.png")).status, 404, "bad shape");
  await f.call("DELETE", "photo");
  assert.equal((await get(w, url)).status, 404, "removed photo is gone");
  await f.call("POST", "photo", pngBytes(), { headers: { "Content-Type": "image/png" } });
  const url2 = (await get(w, "/api/listings?procedure=ufe")).body.people[0].photo;
  await w.backend.data.update("accounts", { npi: ANN }, { level: "basic" });
  assert.equal((await get(w, url2)).status, 404, "partial: not served");
});

test("a new doctor with no listing is placed at their office ZIP center when the geocoder has no match", async () => {
  const w = world(), c = await w.signIn(CARA, "cara@home.example", undefined, ["gae"]);
  await c.put("profile", { offices: [{ practice: "Cara IR", street: "9 Unknown St", city: "Chicago", state: "IL", zip: "60605", phone: "3125550199" }] });
  const p = (await get(w, "/api/listings?procedure=gae")).body.people.find((x) => x.npi === CARA);
  assert.equal(p.offices[0].geo, "zip");
  assert.deepEqual([p.offices[0].lat, p.offices[0].lon], [41.868, -87.617], "60605 center from site/data/zip/606.json");
  const at = await zipCenters(ASSETS)("60611");
  assert.ok(Array.isArray(at));
  assert.equal(await zipCenters(ASSETS)("ab"), null);
});

test("removal: a doctor who withdrew a procedure is in 'removed' even when a public page lists them; never-attested is not", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  assert.equal((await c.post("attest", { procedures: ["pae"], agree: true })).status, 200);
  assert.equal((await c.post("withdraw", { procedure: "ufe" })).status, 200);
  const ufe = (await get(w, "/api/listings?procedure=ufe")).body;
  assert.deepEqual(ufe.removed, [ANN]); assert.equal(ufe.people.length, 0);
  assert.deepEqual((await get(w, "/api/listings?procedure=gae")).body.removed, [], "GAE never attested: the public listing stands");
  assert.equal((await get(w, "/api/listings?procedure=pae")).body.people[0].npi, ANN);
  assert.equal((await w.backend.data.many("attestations", { npi: ANN })).length, 2, "attestation records untouched");
  await c.post("attest", { procedures: ["ufe"], agree: true });
  assert.deepEqual((await get(w, "/api/listings?procedure=ufe")).body.removed, [], "added back");
});

test("removal is the current holder's: a new holder after takeover does not inherit the old holder's withdrawals", async () => {
  const w = world();
  const rows = [{ npi: ANN, attested: [], offices: [], account: { id: "a2", npi: ANN, level: "full", name: "Ann" }, held: [] }];
  const ov = await overlayFor({ data: { overlay: async () => rows } }, "ufe");
  assert.deepEqual(ov.removed, []);
});

test("the request carries the procedure only, never the ZIP", () => {
  const src = readFileSync(new URL("../site/assets/finder.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function loadOverlay"), src.indexOf("function mergeOverlay"));
  assert.match(fn, /"\/api\/listings\?procedure=" \+ encodeURIComponent\(PROC\)/);
  assert.doesNotMatch(fn, /zip/i);
});

test("database down: 503, not cached; the finder then uses the static file", async () => {
  resetForTests();
  const w = world();
  w.backend.data.overlay = async () => { throw new Error("down"); };
  const r = await get(w, "/api/listings?procedure=ufe");
  assert.equal(r.status, 503); assert.match(r.headers.get("Cache-Control"), /no-store/);
});

test("slow database: answers 503 at the time limit instead of hanging", async () => {
  const w = world();
  w.backend.data.overlay = () => new Promise((ok) => setTimeout(() => ok([]), 1500));
  const t = Date.now();
  const r = await get(w, "/api/listings?procedure=ufe", { listingsTimeoutMs: 100 });
  assert.equal(r.status, 503); assert.ok(Date.now() - t < 800, `took ${Date.now() - t} ms`);
});

test("accounts not connected: an empty overlay (no console error on the finder); photos 404", async () => {
  const r = await handlePublic(new Request("http://x/api/listings?procedure=ufe"), {});
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { procedure: "ufe", people: [], removed: [] });
  assert.equal((await handlePublic(new Request("http://x/api/listings?procedure=zz"), {})).status, 404);
  assert.equal((await handlePublic(new Request("http://x/api/photo/1999000015-0123456789abcdef.png"), {})).status, 404);
});

test("cache: a second request inside 60 s is served from memory without a database query", async () => {
  const w = world(); let n = 0; const real = w.backend.data.overlay;
  w.backend.data.overlay = async () => { n++; return real(); };
  resetForTests();
  const env = { backend: w.backend, ASSETS, now: () => 1e12 };
  await handlePublic(new Request("http://x/api/listings?procedure=pae&zip=60611"), env);
  await handlePublic(new Request("http://x/api/listings?procedure=pae&junk=1"), env);
  assert.equal(n, 1, "one query; extra parameters do not bust the cache");
  await handlePublic(new Request("http://x/api/listings?procedure=pae"), { ...env, now: () => 1e12 + 61000 });
  assert.equal(n, 2);
});

test("its own rate limit: 120 a minute per IP", async () => {
  resetForTests();
  const w = world(); let last;
  for (let i = 0; i < 121; i++) last = await handlePublic(new Request("http://x/api/listings?procedure=ufe", { headers: { "CF-Connecting-IP": "10.99.1.1" } }), { backend: w.backend, noCache: true });
  assert.equal(last.status, 429);
});

test("Supabase overlay: one request with embedded accounts and attestations; holder's attestations only", async () => {
  const calls = [];
  const d = supabaseData("https://p.supabase.co", "sb_secret_x", async (url, init) => {
    calls.push(url); assert.ok(init.signal, "has a time limit");
    return new Response(JSON.stringify([{ npi: ANN, attested: ["pae"], accounts: { id: "a1", npi: ANN, level: "basic", name: "Ann",
      attestations: [{ npi: ANN, procedure: "ufe" }, { npi: "1999999999", procedure: "gae" }] } }]), { status: 200 });
  });
  const rows = await d.overlay();
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/rest\/v1\/profiles\?select=.*accounts\(id,npi,level,name,attestations\(npi,procedure\)\)/);
  assert.deepEqual(rows[0].held, ["ufe"]); assert.equal(rows[0].account.level, "basic"); assert.equal(rows[0].accounts, undefined);
});

test("hijack alert: phone, address or link change on an existing listing posts NPI, field, old and new; save never waits", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  assert.equal((await c.put("profile", { offices: [OFF] })).status, 200);
  await settle();
  assert.equal(w.backend.alert.sent.length, 1);
  assert.match(w.backend.alert.sent[0], /NPI 1999000015/);
  assert.match(w.backend.alert.sent[0], /address: "Chicago, IL" -> "100 Test Plaza, Chicago, IL, 60611"/);
  assert.match(w.backend.alert.sent[0], /phone: "\(none\)" -> "3125550100"/);
  await c.put("profile", { booking_url: "https://evil.example/" });
  await settle();
  assert.match(w.backend.alert.sent[1], /website: "\(none\)" -> "https:\/\/evil.example\/"/);
  assert.doesNotMatch(w.backend.alert.sent[1], /phone|address/);
  assert.equal((await w.backend.data.many("exceptions", { kind: "contact_change" })).length, 2, "recorded too");
  w.backend.alert.fail = true;
  const r = await c.put("profile", { offices: [{ ...OFF, phone: "3125550111" }] });
  assert.equal(r.status, 200, "a failed alert does not hold up the save");
  await c.put("profile", { insurances: ["Aetna"] });
  await settle();
  assert.equal(w.backend.alert.sent.length, 2, "insurance is not a contact field");
});

test("hijack alert: a new doctor's first save is quiet; their next change alerts; undo alerts", async () => {
  const w = world(), c = await w.signIn(CARA, "cara@home.example", undefined, ["gae"]);
  const o = { practice: "Cara IR", street: "2 Test Ave", city: "Madison", state: "WI", zip: "53703", phone: "6085550100" };
  await c.put("profile", { offices: [o] }); await settle();
  assert.equal(w.backend.alert.sent.length, 0);
  await c.put("profile", { offices: [{ ...o, phone: "6085550999" }] }); await settle();
  assert.equal(w.backend.alert.sent.length, 1); assert.match(w.backend.alert.sent[0], /"6085550100" -> "6085550999"/);
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "offices" && x.undoable);
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200); await settle();
  assert.match(w.backend.alert.sent[2] || w.backend.alert.sent[1], /"6085550999" -> "6085550100"/);
});

test("contactChanges: unchanged fields and brand-new doctors give nothing", () => {
  assert.deepEqual(contactChanges({ offices: [] }, { offices: [OFF] }, null), []);
  assert.deepEqual(contactChanges({ offices: [OFF] }, { offices: [OFF] }, null), []);
  assert.deepEqual(contactChanges({ offices: [OFF], booking_url: "https://a.example/" }, { booking_url: "https://a.example/" }, null), []);
});

test("Telegram alert adapter: posts to the topic; the token never appears in an error", async () => {
  let sent;
  const a = telegramAlert("123:SECRET", "-100", "3", async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return new Response("{}", { status: 200 }); });
  await a.send("hello");
  assert.equal(sent.body.chat_id, "-100"); assert.equal(sent.body.message_thread_id, 3); assert.equal(sent.body.text, "hello");
  const b = telegramAlert("123:SECRET", "-100", "3", async () => new Response("no", { status: 401 }));
  await assert.rejects(b.send("x"), (e) => !String(e.message).includes("SECRET"));
});

test("wording: no 'next site update' left on the account page", () => {
  const js = readFileSync(new URL("../site/assets/account.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /next site update/i);
  assert.match(js, /within about a minute/);
});

// ---- Review round 1 fixes
test("listed only on the current holder's own attestation (an undo after takeover cannot list without one)", async () => {
  const rows = [{ npi: ANN, attested: ["ufe"], offices: [], account: { id: "a2", npi: ANN, level: "basic", name: "Ann" }, held: [] }];
  const ov = await overlayFor({ data: { overlay: async () => rows } }, "ufe");
  assert.deepEqual(ov.people, []); assert.deepEqual(ov.removed, []);
});

test("Supabase overlay reads pages of 1,000 until a short page (Supabase cuts at 1,000 silently)", async () => {
  const offs = [];
  const d = supabaseData("https://p.supabase.co", "k", async (url) => {
    const off = +/offset=(\d+)/.exec(url)[1]; offs.push(off);
    const n = off < 2000 ? 1000 : 3;
    return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ npi: String(1e9 + off + i), attested: [], accounts: null }))), { status: 200 });
  });
  const rows = await d.overlay();
  assert.deepEqual(offs, [0, 1000, 2000]); assert.equal(rows.length, 2003);
});

test("public photo is cached 60 s: a second request runs no database query", async () => {
  resetForTests();
  const w = world(), f = await w.full(ANN);
  await f.call("POST", "photo", pngBytes(), { headers: { "Content-Type": "image/png" } });
  const url = (await overlayFor(w.backend, "ufe")).people[0].photo;
  let n = 0; const real = w.backend.data.publicPhoto;
  w.backend.data.publicPhoto = async (x) => { n++; return real(x); };
  const env = { backend: w.backend, now: () => 1e12 };
  assert.equal((await handlePublic(new Request("http://x" + url), env)).status, 200);
  assert.equal((await handlePublic(new Request("http://x" + url), env)).status, 200);
  assert.equal(n, 1);
});

test("after a database failure the route answers 503 at once for 15 s, then tries again", async () => {
  resetForTests();
  const w = world(); let n = 0;
  w.backend.data.overlay = async () => { n++; throw new Error("down"); };
  const at = (t) => handlePublic(new Request("http://x/api/listings?procedure=ufe"), { backend: w.backend, noCache: true, now: () => t });
  assert.equal((await at(1e12)).status, 503); assert.equal((await at(1e12 + 5000)).status, 503); assert.equal(n, 1);
  await at(1e12 + 16000); assert.equal(n, 2);
});

test("removal alert: withdrawing a publicly listed procedure alerts; one not on a public page does not; a failed send never blocks", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe", "gae"]);
  assert.equal((await c.post("withdraw", { procedure: "ufe" })).status, 200); await settle();
  assert.equal(w.backend.alert.sent.length, 1);
  assert.match(w.backend.alert.sent[0], /publicly listed procedure removed, NPI 1999000015/);
  assert.match(w.backend.alert.sent[0], /UFE: removed from list/);
  assert.match(w.backend.alert.sent[0], /No email sent to the doctor\./);
  assert.equal((await w.backend.data.many("exceptions", { kind: "listing_removed" })).length, 1);
  assert.equal((await c.post("withdraw", { procedure: "gae" })).status, 200); await settle();
  assert.equal(w.backend.alert.sent.length, 1, "GAE is not on Ann's public listing");
  await c.post("attest", { procedures: ["ufe"], agree: true });
  w.backend.alert.fail = true;
  assert.equal((await c.post("withdraw", { procedure: "ufe" })).status, 200);
});

test("alert text says the doctor is being emailed only when there is an email on file", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  await c.put("profile", { offices: [OFF] }); await settle();
  assert.match(w.backend.alert.sent[0], /The account's login email is being told \(not proof it is the doctor's\)\./);
  await w.backend.data.update("accounts", { npi: ANN }, { email: null });
  const w2 = w; await c.put("profile", { booking_url: "https://x.example/" }); await settle();
  assert.match(w2.backend.alert.sent[1], /No email on file for this account\./);
});

// mergeOverlay runs in the browser; it is taken from finder.js and run here as written.
function finderMerge() {
  const src = readFileSync(new URL("../site/assets/finder.js", import.meta.url), "utf8");
  const code = src.slice(src.indexOf("var CARD_KEYS"), src.indexOf("function wait(")) +
    src.slice(src.indexOf("function mergeOverlay"), src.indexOf("function loadData"));
  const ctx = {}; vm.createContext(ctx); vm.runInContext(code + "; this.mergeOverlay = mergeOverlay;", ctx);
  return ctx.mergeOverlay;
}
test("finder merge: overlay values replace and empty values clear what an earlier export baked into the static file", () => {
  const merge = finderMerge();
  const stat = { people: [
    { npi: ANN, name: "Ann Testone", badge: "verified", city: "Chicago", state: "IL", lat: 41.9, lon: -87.6, confirmed: true,
      photo: "/photos/1999000015-0123456789abcdef.png", booking_url: "https://hijack.example/", blurb: "old", insurances: ["Aetna"],
      insurance_other: "x", insurance_confirm: true, offices: [{ city: "Chicago", state: "IL", lat: 41.9, lon: -87.6 }] },
    { npi: BEN, name: "Ben Sampletwo", badge: "verified", city: "Evanston", state: "IL", lat: 42, lon: -87.7, confirmed: false },
    { npi: GIL, name: "Gil Fourtest", badge: "verified", city: "Skokie", state: "IL", lat: 42, lon: -87.7, confirmed: false }] };
  const ov = { procedure: "ufe", removed: [BEN], people: [
    { npi: ANN, name: "Ann Testone", confirmed: false, offices: [], booking_url: "", insurances: [], insurance_other: "", insurance_confirm: false, blurb: "", photo: "" },
    { npi: CARA, name: "Cara New", confirmed: true, offices: [{ practice: "C", city: "Madison", state: "WI", zip: "53703", phone: "6085550100", lat: 43.07, lon: -89.38, geo: "zip" }],
      booking_url: "https://cara.example/", insurances: ["Medicare"], insurance_other: "", insurance_confirm: false, blurb: "hi", photo: "/api/photo/1999000031-0123456789abcdef.png" }] };
  const out = merge(stat, ov).people;
  const ann = out.find((p) => p.npi === ANN);
  assert.equal(ann.confirmed, false); assert.equal(ann.from_account, true);
  for (const k of ["photo", "booking_url", "blurb", "insurances", "insurance_other", "insurance_confirm", "offices"]) assert.equal(k in ann, false, k);
  assert.equal(ann.city, "Chicago", "found location kept");
  assert.equal(out.some((p) => p.npi === BEN), false, "removed");
  assert.ok(out.some((p) => p.npi === GIL), "untouched");
  const cara = out.find((p) => p.npi === CARA);
  assert.equal(cara.confirmed, true); assert.equal(cara.lat, 43.07); assert.equal(cara.photo, "/api/photo/1999000031-0123456789abcdef.png");
  assert.equal(cara.badge, "account");
  assert.equal(merge(stat, { people: [{ npi: "x", offices: null }], removed: null }).people.length, 4, "odd input: no throw");
});

test("removal alert through undo: undoing an attestation that delists a publicly listed procedure alerts too", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN]);
  assert.equal((await c.post("attest", { procedures: ["ufe"], agree: true })).status, 200);
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "attested" && x.undoable);
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200); await settle();
  assert.deepEqual((await overlayFor(w.backend, "ufe")).removed, [ANN], "delisted");
  assert.equal((await w.backend.data.many("exceptions", { kind: "listing_removed" })).length, 1);
  assert.match(w.backend.alert.sent.at(-1), /UFE: removed from list/);
});
