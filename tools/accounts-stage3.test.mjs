// Stage 3: growth. node --test tools/accounts-stage3.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, ANN, CARA, DAN, EVE, ORG, GIL } from "./accounts-helpers.mjs";
import { exportConfirmed } from "../lib/accounts/service.mjs";
import { schemaColumns } from "./accounts-adapters.test.mjs";

test("new profile: NPI not on the site, radiologist, NPPES name matches: account, then ID check, attest, export", async () => {
  const w = world({ name: "Cara Newdoc" }), c = w.client();
  assert.equal((await c.post("signup", { npi: CARA, email: "cara@home.example", accept_terms: true })).status, 400, "name needed");
  assert.equal((await c.post("signup", { npi: CARA, email: "cara@home.example", accept_terms: true, name: "Carla Smith" })).body.error, "name_mismatch");
  const r = await c.post("signup", { npi: CARA, email: "cara@home.example", accept_terms: true, name: "Dr. Cara J. Newdoc, MD" });
  assert.equal(r.status, 202); assert.ok(!r.body.waitlist);
  assert.equal((await c.post("link", { token: w.lastLink("cara@home.example") })).status, 200);
  const prof = await w.backend.data.one("profiles", { npi: CARA });
  assert.equal(prof.new_profile, true);
  assert.equal((await c.post("check/email", { work_email: "cara@anything.example" })).status, 400, "no listing, so no domain to match");
  await c.post("check/identity");
  const s = (await w.backend.data.many("identity_checks"))[0].provider_session;
  w.backend.identity.complete(s, { status: "verified", first: "Cara", last: "Newdoc" });
  await w.client().call("POST", "identity/result", { session: s, ...w.backend.identity.sessions.get(s) });
  await c.post("attest", { procedures: ["gae"], agree: true });
  await c.put("profile", { offices: [{ practice: "", city: "Evanston", state: "IL", zip: "60201", phone: "" }] });
  const exp = await exportConfirmed(w.backend);
  assert.equal(exp[0].npi, CARA); assert.equal(exp[0].new_profile, true); assert.deepEqual(exp[0].procedures, ["gae"]);
});

test("new profile: a physician who is not a radiologist goes on the waitlist; no account, no link", async () => {
  const w = world(), c = w.client();
  const r = await c.post("signup", { npi: DAN, email: "dan@ortho.example", accept_terms: true, name: "Dan Orthotest" });
  assert.equal(r.status, 202); assert.equal(r.body.waitlist, true);
  assert.equal(w.outbox.length, 0);
  assert.equal((await w.backend.data.many("accounts")).length, 0);
  const wl = await w.backend.data.many("waitlist");
  assert.equal(wl.length, 1); assert.equal(wl[0].taxonomy, "207X00000X");
});

test("not a physician, or an organisation NPI: refused", async () => {
  const w = world(), c = w.client();
  assert.equal((await c.post("signup", { npi: EVE, email: "e@x.example", accept_terms: true, name: "Eve Nursetest" })).body.error, "not_a_physician");
  assert.equal((await c.post("signup", { npi: ORG, email: "o@x.example", accept_terms: true })).body.error, "npi_not_individual");
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
  const c = await w.signIn(ANN, "ann@lakesideir.example");
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
  const c = await w.signIn(GIL, "gil@home.example");
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

test("Doximity alone never counts as the going-live check", async () => {
  const w = world({ doximity: true });
  const c = await w.signIn(GIL, "gil@home.example");
  const loc = await doxFlow(w, c, { id: "dx-5", first: "Gil", last: "Fourtest" });
  await c.post("doximity/link", { token: /#doximity=([0-9a-f]{64})$/.exec(loc)[1] });
  assert.equal((await c.get("me")).body.account.status, "unverified");
});

test("schema has every column the code writes", async () => {
  const w = world({ doximity: true, name: "Cara Newdoc" });
  const c = await w.verifyByEmail(await w.signIn(), "ann@lakesideir.example");
  const a = await w.signIn(ANN, "ann@lakesideir.example");
  await a.post("attest", { procedures: ["ufe"], agree: true });
  await a.put("profile", { blurbs: { ufe: "Hi." }, booking_url: "https://lakesideir.example/b" });
  const e = (await a.get("edits")).body.edits.find((x) => x.field === "blurbs");
  await a.post("undo", { edit_id: e.id });
  await w.client().post("signup", { npi: ANN, email: "other@x.example", accept_terms: true });
  await w.client().post("signup", { npi: DAN, email: "dan@x.example", accept_terms: true, name: "Dan Orthotest" });
  const g = await w.signIn(GIL, "gil@home.example");
  await g.post("check/identity");
  const loc = await doxFlow(w, a, { id: "dx-9", first: "Ann", last: "Testone" });
  await a.post("doximity/link", { token: /#doximity=([0-9a-f]{64})$/.exec(loc)[1] });
  const cols = schemaColumns();
  for (const [table, rows] of w.backend.data.tables) {
    assert.ok(cols[table], `table ${table} in schema.sql`);
    for (const r of rows) for (const k of Object.keys(r)) assert.ok(cols[table].includes(k), `${table}.${k} in schema.sql`);
  }
  assert.ok(c);
});

test("the public finder pages load no account code", () => {
  for (const p of ["ufe", "pae", "gae"]) {
    const html = readFileSync(new URL(`../site/${p}/index.html`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /account\.js|\/api\/account/);
  }
  const finder = readFileSync(new URL("../site/assets/finder.js", import.meta.url), "utf8");
  assert.doesNotMatch(finder.replace(/\/\/.*$/gm, ""), /\/api\/|document\.cookie|localStorage|sessionStorage/);
});
