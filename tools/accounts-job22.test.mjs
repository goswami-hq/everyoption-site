// Job 22: accounts restructure. node --test tools/accounts-job22.test.mjs
// His rule (2026-11-03): partial access (email code) edits freely and stays in Likely performs; full access moves the
// card to Confirmed and adds the photo and invitations. Find yourself by name. Procedures out of sign-up. Photo view.
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, BEN, GIL, EMAIL } from "./accounts-helpers.mjs";
import { AGREEMENT, exportConfirmed } from "../lib/accounts/service.mjs";
import { nppesRegistry } from "../lib/accounts/vendors.mjs";
import { splitName, nameHit } from "../lib/accounts/util.mjs";

import zlib from "node:zlib";
function pngBytes(w = 160, h = 160) {     // a real PNG (same as accounts-job11.test.mjs)
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 120)])));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

test("names: First Last, Last, First, titles dropped; a listed name matches on last name and first-name start", () => {
  assert.deepEqual(splitName("Dr. Ann Testone MD"), { first: "ann", last: "testone" });
  assert.deepEqual(splitName("Testone, Ann"), { first: "ann", last: "testone" });
  assert.deepEqual(splitName("testone"), { first: "", last: "testone" });
  assert.ok(nameHit("Ann Testone", { first: "an", last: "Testone" }));
  assert.ok(nameHit("Gil Fourtest", { first: "Gilberto", last: "Fourtest" }));
  assert.ok(!nameHit("Ann Testone", { first: "Ben", last: "Testone" }));
});

test("find yourself: our listings and the registry together, listed first, physicians only, public fields only", async () => {
  const w = world(), c = w.client("10.22.0.1");
  const r = await c.get("search?name=" + encodeURIComponent("Ann Testone"));
  assert.equal(r.status, 200); assert.equal(r.body.registry, "ok");
  assert.equal(r.body.results[0].npi, ANN); assert.deepEqual(r.body.results[0].listed_for, ["ufe", "pae"]);
  assert.equal(r.body.results[0].city, "Chicago");
  assert.ok(r.body.results.some((x) => x.npi === "1999000080"), "Anna Testone in Texas also matches 'Ann'");
  for (const x of r.body.results) assert.deepEqual(Object.keys(x).sort(), ["city", "credential", "listed_for", "name", "npi", "specialty", "state"]);
  const il = await c.get("search?name=Testone&state=IL");
  assert.deepEqual(il.body.results.map((x) => x.npi), [ANN], "state narrows it");
  const nurse = await c.get("search?name=Eve+Nursetest");
  assert.equal(nurse.body.results.length, 0, "non-physicians are not offered");
  assert.equal((await c.get("search?name=A")).status, 400);
  assert.equal((await c.get("search?name=Ann+Testone&state=Illinois")).status, 400);
});

test("find yourself: the registry down still shows our listings and says so", async () => {
  const w = world(); w.backend.nppes.down = true;
  const r = await w.client("10.22.0.2").get("search?name=Gil+Fourtest");
  assert.equal(r.status, 200); assert.equal(r.body.registry, "unavailable"); assert.equal(r.body.results[0].npi, GIL);
});

test("registry adapter: name search builds the public query and returns only public fields", async () => {
  let asked = "";
  const fake = async (url) => { asked = url; return new Response(JSON.stringify({ result_count: 1, results: [{ number: "1999000015",
    enumeration_type: "NPI-1", basic: { first_name: "ANN", last_name: "TESTONE", credential: "M.D." },
    taxonomies: [{ code: "2085R0204X", desc: "Radiology, Vascular & Interventional Radiology", primary: true }],
    addresses: [{ address_purpose: "MAILING", city: "OAK PARK", state: "IL", address_1: "PO Box 1" },
      { address_purpose: "LOCATION", city: "CHICAGO", state: "IL", address_1: "1 Main St", telephone_number: "312-555-0100" }] }] }), { status: 200 }); };
  const out = await nppesRegistry(fake).search({ first: "an", last: "testone", state: "IL" });
  const q = new URL(asked).searchParams;
  assert.equal(q.get("last_name"), "testone"); assert.equal(q.get("first_name"), "an*"); assert.equal(q.get("state"), "IL");
  assert.equal(q.get("enumeration_type"), "NPI-1");
  assert.equal(out[0].npi, "1999000015"); assert.equal(out[0].city, "CHICAGO"); assert.ok(!JSON.stringify(out).includes("555"), "no phone");
  await nppesRegistry(fake).search({ first: "a", last: "testone", state: "" });
  assert.equal(new URL(asked).searchParams.get("first_name"), null, "one letter is not sent (the registry needs 2 before *)");
});

test("sign-up asks no procedures; the agreement is about who they are; the card stays in Likely", async () => {
  assert.doesNotMatch(AGREEMENT("Ann Testone", ANN), /tick/i);
  const w = world(), c = await w.signIn(ANN);
  const me = (await c.get("me")).body;
  assert.deepEqual(me.profile.attested, []); assert.equal(me.group, "likely");
  assert.equal((await exportConfirmed(w.backend)).length, 0, "no procedure yet: on no list from the account");
});

test("procedures: add one at a time with its own attestation; remove any time; attestation records stay", async () => {
  const w = world(), c = await w.signIn(ANN);
  assert.equal((await c.post("attest", { procedures: ["gae"], agree: true })).status, 200);
  assert.equal((await c.post("attest", { procedures: ["ufe"], agree: true })).status, 200);
  assert.deepEqual((await c.get("me")).body.profile.attested, ["gae", "ufe"]);
  const r = await c.post("withdraw", { procedure: "gae" });
  assert.equal(r.status, 200); assert.deepEqual(r.body.attested, ["ufe"]);
  assert.equal((await w.backend.data.many("attestations", { npi: ANN })).length, 2, "both attestations kept");
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "attested" && x.undoable);
  assert.deepEqual(e.after, ["ufe"]);
  assert.equal((await c.post("withdraw", { procedure: "xyz" })).status, 400);
  const ex = (await exportConfirmed(w.backend))[0];
  assert.deepEqual(ex.procedures, ["ufe"]); assert.equal(ex.confirmed, false);
});

test("a new doctor with no listing on partial access: own offices, phone, link, in Likely", async () => {
  const w = world(), c = await w.signIn("1999000031", "cara@home.example", undefined, ["ufe"]);
  const off = { practice: "Cara IR", street: "2 Test Ave", city: "Madison", state: "WI", zip: "53703", phone: "6085550100" };
  assert.equal((await c.put("profile", { offices: [off], booking_url: "https://cara-ir.example/" })).status, 200);
  const ex = (await exportConfirmed(w.backend))[0];
  assert.equal(ex.new_profile, true); assert.equal(ex.confirmed, false); assert.equal(ex.offices[0].phone, "6085550100");
  assert.equal(ex.booking_url, "https://cara-ir.example/");
});

test("photo: served only to the signed-in holder, never cached; remove needs no proof; partial cannot upload", async () => {
  const w = world(), c = await w.full(ANN);
  assert.equal((await c.get("photo")).status, 404, "none yet");
  const up = await c.call("POST", "photo", pngBytes(), { headers: { "Content-Type": "image/png" } });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const r = await c.call("GET", "photo");
  assert.equal(r.status, 200); assert.equal(r.headers.get("Content-Type"), "image/png");
  assert.match(r.headers.get("Cache-Control"), /no-store/); assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal((await w.client("10.22.9.9").get("photo")).status, 401, "signed out: nothing");
  const other = await w.signIn(GIL);
  assert.equal((await other.get("photo")).status, 404, "another doctor sees only their own (none)");
  assert.equal((await exportConfirmed(w.backend)).find((x) => x.npi === ANN).photo !== "", true);
  const del = await c.call("DELETE", "photo");
  assert.equal(del.status, 200); assert.deepEqual(del.body.changed, ["photo"]);
  assert.equal((await c.get("photo")).status, 404);
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "photo" && x.after === null);
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200, "full access can put it back");
  const p = await w.signIn(BEN, EMAIL[BEN]);
  const no = await p.call("POST", "photo", pngBytes(), { headers: { "Content-Type": "image/png" } });
  assert.equal(no.status, 403); assert.equal(no.body.error, "full_needed");
});
