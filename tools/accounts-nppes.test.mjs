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
const signup = async (person) => {
  const w = world(); w.backend.nppes = { lookup: async () => ({ type: "NPI-1", first: "A", last: "B", ...person }) };
  return w.client().post("signup", { npi: NPI, email: "a@home.example", agree: true });
};

test("a trainee code with an MD credential is a physician: waitlist, not a refusal", async () => {
  const r = await signup({ taxonomy: "390200000X", taxonomies: ["390200000X"], credential: "M.D." });
  assert.equal(r.status, 202); assert.equal(r.body.waitlist, true);
});

test("a radiology code that is not primary still counts as a radiologist", async () => {
  const r = await signup({ taxonomy: "390200000X", taxonomies: ["390200000X", "2085R0202X"], credential: "MD" });
  assert.equal(r.status, 202); assert.ok(!r.body.waitlist);
});

test("a trainee code with no physician credential is still refused", async () => {
  for (const credential of ["", "PharmD", "MDiv", "DOT"]) {
    const r = await signup({ taxonomy: "390200000X", taxonomies: ["390200000X"], credential });
    assert.equal(r.body.error, "not_a_physician", credential);
  }
});
