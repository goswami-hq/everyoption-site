// Procedure registry job 2 (ai-hq job platform-directory-0033): profiles.attested is a jsonb list, so the database's
// foreign key to procedures(key) does not reach it. Every write of it must hold only keys the registry offers (PROCS).
// Two paths wrote stored values back without that check: undo of an "attested" edit, and a takeover that reuses the
// claimant's stored claim_procedures. node --test tools/attested-registry.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, EMAIL } from "./accounts-helpers.mjs";
import { PROCS } from "../lib/procedures.mjs";

const onlyRegistry = (list) => (list || []).every((k) => PROCS.includes(k));

test("undo of an attested edit never restores a key the registry does not offer", async () => {
  const w = world(), c = await w.full(ANN, EMAIL[ANN], ["ufe"]);
  const acct = await w.backend.data.one("accounts", { npi: ANN });
  const prof = await w.backend.data.one("profiles", { npi: ANN });
  // A stored edit whose "before" holds an unissued key (as a retired or mistyped key would look).
  const e = await w.backend.data.insert("edits", { account_id: acct.id, npi: ANN, field: "attested", before: ["ufe", "zzz"],
    after: prof.attested, at: new Date(w.clock.t).toISOString(), undo_of: null, undone_by: null });
  await c.post("undo", { edit_id: e.id });
  const after = (await w.backend.data.one("profiles", { npi: ANN })).attested;
  assert.ok(onlyRegistry(after), "profiles.attested holds " + JSON.stringify(after));
});

test("a takeover never writes a stored claim key the registry does not offer", async () => {
  const w = world();
  const squat = w.client("10.9.7.1");
  await squat.post("invite/accept", { token: await w.invite(ANN, "owner"), agree: true, procedures: ["ufe"] });
  const real = w.client("10.9.7.2");
  const s = await real.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example", agree: true, procedures: ["gae"] });
  await real.post("code", { challenge: s.body.challenge, code: w.lastCode("ann@home.example") });
  await w.backend.data.update("accounts", { claim_npi: ANN }, { claim_procedures: ["gae", "zzz"] });
  assert.equal((await w.idCheck(real)).takeover, true);
  const prof = await w.backend.data.one("profiles", { npi: ANN });
  assert.ok(onlyRegistry(prof.attested), "profiles.attested holds " + JSON.stringify(prof.attested));
  assert.deepEqual(prof.attested, ["gae"]);
  const rows = await w.backend.data.many("attestations", { npi: ANN });
  assert.ok(rows.every((r) => PROCS.includes(r.procedure)), "attestation rows hold only registry keys");
});
