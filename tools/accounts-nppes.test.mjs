// Who counts as a physician or radiologist, from the live NPI Registry response shape.
import test from "node:test";
import assert from "node:assert/strict";
import { nppesRegistry } from "../lib/accounts/vendors.mjs";
import { world } from "./accounts-helpers.mjs";

const reply = (basic, taxonomies) => async () => ({ ok: true, json: async () => ({ results: [{ enumeration_type: "NPI-1", basic, taxonomies }] }) });

test("the registry adapter keeps every specialty code and the credential", async () => {
  const p = await nppesRegistry(reply({ first_name: "A", last_name: "B", credential: "M.D." },
    [{ code: "390200000X", desc: "Student", primary: true }, { code: "2085R0202X", desc: "Diagnostic Radiology", primary: false }])).lookup("1234567893");
  assert.deepEqual(p.taxonomies, ["390200000X", "2085R0202X"]);
  assert.equal(p.credential, "M.D.");
  assert.equal(p.taxonomy, "390200000X");
});

const NPI = "1234567893";
const signup = async (person, body = { specialty: "ir" }) => {
  const w = world(); w.backend.nppes = { lookup: async () => ({ type: "NPI-1", first: "A", last: "B", ...person }) };
  const r = await w.client().post("signup", { npi: NPI, email: "a@home.example", agree: true, ...body });
  return { ...r, w };
};
const TRAINEE = { taxonomy: "390200000X", taxonomies: ["390200000X"] };

test("any physician NPI stating IR gets a code: trainee code, other specialty, or an MD credential", async () => {
  for (const person of [TRAINEE, { taxonomy: "207X00000X", taxonomies: ["207X00000X"] }, { taxonomy: "174400000X", taxonomies: ["174400000X"], credential: "M.D." }]) {
    const r = await signup(person);
    assert.equal(r.status, 202); assert.ok(r.body.challenge); assert.ok(!r.body.waitlist);
  }
});

test("stating diagnostic radiology or other goes on the waitlist with no code, even for an IR code", async () => {
  const ir = { taxonomy: "2085R0204X", taxonomies: ["2085R0204X"] };
  for (const [body, want] of [[{ specialty: "dr" }, /Stated: Diagnostic radiology/], [{ specialty: "other", specialty_other: "Vascular surgery" }, /Stated: Vascular surgery/]]) {
    const r = await signup(ir, body);
    assert.equal(r.status, 202); assert.equal(r.body.waitlist, true); assert.ok(!r.body.challenge);
    assert.equal(r.w.outbox.length, 0);
    assert.match((await r.w.backend.data.many("waitlist"))[0].taxonomy_desc, want);
  }
});

test("a specialty is required, and other needs its text", async () => {
  for (const body of [{}, { specialty: "x" }, { specialty: "other" }, { specialty: "other", specialty_other: "  " }])
    assert.equal((await signup(TRAINEE, body)).status, 400);
});

test("a non-physician code with no physician degree is still refused", async () => {
  for (const credential of ["", "NP", "MDiv", "DOT"]) {
    const r = await signup({ taxonomy: "363L00000X", taxonomies: ["363L00000X"], credential });
    assert.equal(r.body.error, "not_a_physician", credential);
  }
});
