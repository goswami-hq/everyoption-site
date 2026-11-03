// Stage 3: growth. node --test tools/accounts-stage3.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, ANN, BEN, CARA, DAN, EVE, ORG, GIL } from "./accounts-helpers.mjs";
import { exportConfirmed } from "../lib/accounts/service.mjs";
import { schemaColumns } from "./accounts-adapters.test.mjs";

test("new profile: NPI not on the site, radiologist: no name typed; NPPES name; ID check, attest, export", async () => {
  const w = world(), c = w.client();
  const lk = await c.get("lookup?npi=" + CARA);
  assert.equal(lk.body.name, "Cara Newdoc"); assert.deepEqual(lk.body.listed_for, []);
  const r = await c.post("signup", { specialty: "ir", npi: CARA, email: "cara@home.example", agree: true, procedures: ["gae"] });
  assert.equal(r.status, 202); assert.ok(!r.body.waitlist);
  assert.equal((await c.post("code", { challenge: r.body.challenge, code: w.lastCode("cara@home.example") })).status, 200);
  const prof = await w.backend.data.one("profiles", { npi: CARA });
  assert.equal(prof.new_profile, true); assert.equal((await w.backend.data.one("accounts", { npi: CARA })).name, "Cara Newdoc");
  await w.idCheck(c);
  await c.put("profile", { offices: [{ practice: "", street: "1 Test Way", city: "Evanston", state: "IL", zip: "60201", phone: "" }] });
  const exp = await exportConfirmed(w.backend);
  assert.equal(exp[0].npi, CARA); assert.equal(exp[0].new_profile, true); assert.deepEqual(exp[0].procedures, ["gae"]);
  assert.equal(exp[0].offices[0].city, "Evanston");
});

test("new profile: a physician who is not a radiologist goes on the waitlist; no account, no code", async () => {
  const w = world(), c = w.client();
  const r = await c.post("signup", { specialty: "other", specialty_other: "Orthopaedic surgery", npi: DAN, email: "dan@ortho.example", agree: true });
  assert.equal(r.status, 202); assert.equal(r.body.waitlist, true);
  assert.equal(w.outbox.length, 0);
  assert.equal((await w.backend.data.many("accounts")).length, 0);
  const wl = await w.backend.data.many("waitlist");
  assert.equal(wl.length, 1); assert.equal(wl[0].taxonomy, "207X00000X"); assert.match(wl[0].taxonomy_desc, /Stated: Orthopaedic surgery/);
});

test("not a physician, or an organisation NPI: refused", async () => {
  const w = world(), c = w.client();
  assert.equal((await c.post("signup", { specialty: "ir", npi: EVE, email: "e@x.example", agree: true })).body.error, "not_a_physician");
  assert.equal((await c.post("signup", { specialty: "ir", npi: ORG, email: "o@x.example", agree: true })).body.error, "npi_not_individual");
});

test("Doximity off: its routes are not there", async () => {
  const w = world(), c = w.client();
  assert.equal((await c.get("doximity/start")).status, 404);
  assert.equal((await c.get("status")).body.doximity, false);
});

async function doxFlow(w, c, profile) {
  const s = await c.call("GET", "doximity/start");
  assert.equal(s.status, 302);
  const state = new URL(s.headers.get("Location"), "http://x").searchParams.get("state");
  const code = w.backend.doximity.grant(profile);
  const cb = await c.call("GET", `doximity/callback?code=${code}&state=${state}`);
  assert.equal(cb.status, 302);
  return cb.headers.get("Location");
}

test("Doximity on: link from a signed-in account when the name matches NPPES, then sign in with it", async () => {
  const w = world({ doximity: true });
  const c = await w.signIn(ANN);
  assert.equal((await c.get("status")).body.doximity, true);
  const loc = await doxFlow(w, c, { id: "dx-1", first: "Ann", last: "Testone", credentials: "MD", specialty: "Radiology" });
  const tok = /#doximity=([0-9a-f]{64})$/.exec(loc)[1];
  assert.equal((await c.post("doximity/link", { token: tok })).status, 200);
  assert.equal((await w.backend.data.one("accounts", { npi: ANN })).doximity_id, "dx-1");
  const fresh = w.client("10.0.0.7");
  const loc2 = await doxFlow(w, fresh, { id: "dx-1", first: "Ann", last: "Testone" });
  assert.match(loc2, /#doximity=signed-in$/);
  assert.equal((await fresh.get("me")).body.account.npi, ANN);
});

test("Doximity: wrong state refused; unknown Doximity user is told to sign in by email; name mismatch is an exception", async () => {
  const w = world({ doximity: true });
  const c = await w.signIn(GIL);
  await c.call("GET", "doximity/start");
  const code = w.backend.doximity.grant({ id: "dx-2", first: "Gil", last: "Fourtest" });
  const bad = await c.call("GET", `doximity/callback?code=${code}&state=forged`);
  assert.match(bad.headers.get("Location"), /#doximity=failed$/);
  const anon = w.client("10.0.0.8");
  const loc = await doxFlow(w, anon, { id: "dx-3", first: "Someone", last: "Else" });
  const tok = /#doximity=([0-9a-f]{64})$/.exec(loc)[1];
  assert.equal((await anon.post("doximity/link", { token: tok })).status, 401, "not signed in");
  const loc3 = await doxFlow(w, c, { id: "dx-4", first: "Gilbert", last: "Other" });
  const t3 = /#doximity=([0-9a-f]{64})$/.exec(loc3)[1];
  assert.equal((await c.post("doximity/link", { token: t3 })).status, 409);
  assert.equal((await w.backend.data.many("exceptions", { kind: "doximity_name_mismatch" })).length, 1);
  assert.equal((await w.backend.data.one("accounts", { npi: GIL })).doximity_id, null);
});

test("Doximity counts as proof only when name and specialty match NPPES and the name is unique among radiologists", async () => {
  const w = world({ doximity: true });
  const g = await w.signIn(GIL);
  const r1 = await g.post("doximity/link", { token: /#doximity=([0-9a-f]{64})$/.exec(await doxFlow(w, g, { id: "dx-5", first: "Gil", last: "Fourtest", specialty: "Vascular & Interventional Radiology" }))[1] });
  assert.equal(r1.body.proof, true); assert.equal((await g.get("me")).body.account.level, "full");
  assert.equal((await g.get("me")).body.account.proof, "doximity");
  const b = await w.signIn(BEN);
  const r2 = await b.post("doximity/link", { token: /#doximity=([0-9a-f]{64})$/.exec(await doxFlow(w, b, { id: "dx-6", first: "Ben", last: "Sampletwo", specialty: "Radiology" }))[1] });
  assert.equal(r2.status, 200); assert.equal(r2.body.proof, false); assert.equal(r2.body.reason, "name_not_unique");
  assert.equal((await b.get("me")).body.account.level, "basic", "two radiologists share the name: linked for sign-in only");
  const a = await w.signIn(ANN);
  const r3 = await a.post("doximity/link", { token: /#doximity=([0-9a-f]{64})$/.exec(await doxFlow(w, a, { id: "dx-7", first: "Ann", last: "Testone", specialty: "Family Medicine" }))[1] });
  assert.equal(r3.body.proof, false); assert.equal(r3.body.reason, "specialty");
  assert.equal((await a.get("me")).body.account.level, "basic");
});

test("lost email: a linked Doximity account signs in without the email", async () => {
  const w = world({ doximity: true });
  const g = await w.signIn(GIL);
  await g.post("doximity/link", { token: /#doximity=([0-9a-f]{64})$/.exec(await doxFlow(w, g, { id: "dx-8", first: "Gil", last: "Fourtest", specialty: "Radiology" }))[1] });
  const fresh = w.client("10.3.3.3");
  assert.match(await doxFlow(w, fresh, { id: "dx-8", first: "Gil", last: "Fourtest" }), /#doximity=signed-in$/);
  assert.equal((await fresh.get("me")).body.account.npi, GIL);
});

test("schema has every column the code writes", async () => {
  const w = world({ doximity: true });
  const a = await w.full(ANN);
  await a.put("profile", { blurbs: { ufe: "Hi." }, booking_url: "https://lakesideir.example/b" });
  const e = (await a.get("edits")).body.edits.find((x) => x.field === "blurbs");
  await a.post("undo", { edit_id: e.id });
  const claimant = w.client("10.2.2.2");
  const s = await claimant.post("signup", { specialty: "ir", npi: ANN, email: "other@x.example", agree: true });
  await claimant.post("code", { challenge: s.body.challenge, code: w.lastCode("other@x.example") });
  await w.client().post("signup", { specialty: "ir", npi: DAN, email: "dan@x.example", agree: true });
  await w.client().post("login", { email: "nobody@x.example" });
  await a.post("email", { email: "ann2@x.example" });
  const tok = /#invite=([0-9a-f]{64})$/.exec((await a.post("invite/create", { npi: GIL })).body.url)[1];
  await w.client("10.2.2.3").post("invite/accept", { token: tok, agree: true, procedures: ["ufe"] });
  const b = await w.signIn(BEN);
  await w.idCheck(b, "Bob", "Other");
  const loc = await doxFlow(w, a, { id: "dx-9", first: "Ann", last: "Testone", specialty: "Radiology" });
  await a.post("doximity/link", { token: /#doximity=([0-9a-f]{64})$/.exec(loc)[1] });
  await w.svc().revokeInviter(ANN);
  const cols = schemaColumns();
  for (const [table, rows] of w.backend.data.tables) {
    assert.ok(cols[table], `table ${table} in schema.sql`);
    for (const r of rows) for (const k of Object.keys(r)) assert.ok(cols[table].includes(k), `${table}.${k} in schema.sql`);
  }
});

test("the public finder pages load no account code", () => {
  for (const p of ["ufe", "pae", "gae"]) {
    const html = readFileSync(new URL(`../site/${p}/index.html`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /account\.js|\/api\/account/);
  }
  const finder = readFileSync(new URL("../site/assets/finder.js", import.meta.url), "utf8");
  // Job 25: the public overlay and photo routes only (no cookies, no account routes, no storage).
  const code = finder.replace(/\/\/.*$/gm, "").split('"/api/listings?procedure="').join("").split("(photos|api\\/photo)").join("");
  assert.doesNotMatch(code, /\/api\/|api\\\/|document\.cookie|localStorage|sessionStorage/);
});
