// Job 16: several offices with street addresses; coordinates found once, on save. node --test tools/accounts-job16.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN } from "./accounts-helpers.mjs";
import { exportConfirmed, OFFICES_MAX } from "../lib/accounts/service.mjs";
import { censusGeocoder } from "../lib/accounts/vendors.mjs";
import { backendFrom } from "../lib/accounts/backend.mjs";

const CHI = { practice: "Test IR Chicago", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550142" };
const EVA = { practice: "Test IR North", street: "200 Sample Road", city: "Evanston", state: "IL", zip: "60201", phone: "8475550123" };
const LOST = { practice: "Nowhere IR", street: "9 Unknown Street", city: "Chicago", state: "IL", zip: "60605", phone: "" };

test("offices: street required for a new office; limit of 5 kept", async () => {
  const w = world(), c = await w.full(ANN, undefined, ["ufe"]);
  const { street, ...noStreet } = CHI;
  const r = await c.put("profile", { offices: [noStreet] });
  assert.equal(r.status, 400); assert.equal(r.body.error, "street_required");
  assert.equal(OFFICES_MAX, 5);
  const six = Array.from({ length: 6 }, (_, i) => ({ ...CHI, street: `${i + 1} Test Way` }));
  assert.equal((await c.put("profile", { offices: six })).status, 400);
});

test("offices: an office saved before streets were asked for may stay without one", async () => {
  const w = world(), c = await w.full(ANN, undefined, ["ufe"]);
  const { street, ...old } = CHI;
  await w.backend.data.update("profiles", { npi: ANN }, { offices: [{ ...old }] });
  assert.equal((await c.put("profile", { offices: [old, EVA] })).status, 200, "old office kept, new one has a street");
});

test("coordinates: found once when saved; unchanged offices are not looked up again", async () => {
  const w = world(), c = await w.full(ANN, undefined, ["ufe"]), g = w.backend.geocoder;
  const r = await c.put("profile", { offices: [CHI, EVA] });
  assert.equal(r.status, 200); assert.equal(r.body.unmatched, undefined);
  assert.equal(g.calls, 2);
  const p = await w.backend.data.one("profiles", { npi: ANN });
  assert.deepEqual([p.offices[0].lat, p.offices[0].lon, p.offices[0].geo], [41.89212, -87.62185, "address"]);
  assert.equal(p.offices[1].geo, "address");
  await c.put("profile", { offices: [{ ...CHI, phone: "3125550199" }, EVA] });       // phone only: no new lookup
  assert.equal(g.calls, 2);
  await c.put("profile", { offices: [EVA, CHI] });                                    // reordered: no new lookup
  assert.equal(g.calls, 2);
});

test("a failed address: the doctor is told plainly, it saves, and that office uses its ZIP center", async () => {
  const w = world(), c = await w.full(ANN, undefined, ["ufe"]);
  const r = await c.put("profile", { offices: [CHI, LOST] });
  assert.equal(r.status, 200); assert.deepEqual(r.body.unmatched, [1]);
  const p = await w.backend.data.one("profiles", { npi: ANN });
  assert.deepEqual([p.offices[1].lat, p.offices[1].lon, p.offices[1].geo], [null, null, "zip"]);
  w.backend.geocoder.fail = true;                                                    // the service is down
  const r2 = await c.put("profile", { offices: [CHI, { ...EVA, street: "201 Sample Road" }] });
  assert.equal(r2.status, 200); assert.deepEqual(r2.body.unmatched, [1]);
  w.backend.geocoder.fail = false;                                                   // back up: the same office is found now
  const r3 = await c.put("profile", { offices: [CHI, { ...EVA, street: "201 Sample Road" }] });
  assert.equal(r3.status, 200); assert.deepEqual(r3.body.unmatched, [1], "asked again, still no match: told again");
  assert.deepEqual(r3.body.changed, [], "same result as before: no change logged, no email");
});

test("contact-change rules still apply: full access only, email to the doctor, undoable", async () => {
  const w = world(), b = await w.signIn(ANN, undefined, undefined, ["ufe"]);
  assert.equal((await b.put("profile", { offices: [CHI] })).status, 403, "basic access cannot change offices");
  const w2 = world(), c = await w2.full(ANN, undefined, ["ufe"]);
  await c.put("profile", { offices: [CHI] });
  const m = w2.outbox.at(-1);
  assert.match(m.subject, /contact details changed/i); assert.match(m.text, /office details/);
  await c.put("profile", { offices: [CHI, EVA] });
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "offices" && x.undoable);
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200);
  assert.equal((await w2.backend.data.one("profiles", { npi: ANN })).offices.length, 1);
});

test("export: offices with coordinates, nothing private", async () => {
  const w = world(), c = await w.full(ANN, undefined, ["ufe"]);
  await c.put("profile", { offices: [CHI, LOST] });
  const [x] = await exportConfirmed(w.backend);
  assert.deepEqual(Object.keys(x.offices[0]).sort(), ["city", "geo", "lat", "lon", "phone", "practice", "state", "street", "zip"]);
  assert.equal(x.offices[0].geo, "address"); assert.equal(x.offices[0].lat, 41.89212);
  assert.deepEqual([x.offices[1].lat, x.offices[1].geo], [null, "zip"]);
  assert.ok(!JSON.stringify(x).includes("@"), "no email address in the public card");
});

test("an office saved with no geocoder, or while it was down, is looked up at the next save; no false message", async () => {
  const w = world(), c = await w.full(ANN, undefined, ["ufe"]), g = w.backend.geocoder;
  w.backend.geocoder = null;
  const r = await c.put("profile", { offices: [CHI] });
  assert.equal(r.status, 200); assert.equal(r.body.unmatched, undefined, "nothing was checked, so nothing is reported");
  assert.equal((await w.backend.data.one("profiles", { npi: ANN })).offices[0].geo, "zip");
  const n = w.outbox.length;
  assert.deepEqual((await c.put("profile", { offices: [CHI] })).body.changed, [], "unchanged: no change, no email");
  assert.equal(w.outbox.length, n);
  w.backend.geocoder = g;
  await c.put("profile", { offices: [CHI, EVA] });
  const p = await w.backend.data.one("profiles", { npi: ANN });
  assert.deepEqual(p.offices.map((o) => o.geo), ["address", "address"]); assert.equal(g.calls, 2);
});

test("Census adapter: parses x as longitude and y as latitude; no match is null; off unless GEOCODER_ON", async () => {
  let asked = "";
  const fake = (body) => async (u) => { asked = u; return { ok: true, json: async () => body }; };
  const hit = await censusGeocoder(fake({ result: { addressMatches: [{ matchedAddress: "4600 SILVER HILL RD, WASHINGTON, DC, 20233",
    coordinates: { x: -76.92748724230096, y: 38.84601622386617 } }] } })).locate({ street: "4600 Silver Hill Rd", city: "Washington", state: "DC", zip: "20233" });
  assert.equal(hit.lat, 38.84601622386617); assert.equal(hit.lon, -76.92748724230096);
  assert.match(asked, /^https:\/\/geocoding\.geo\.census\.gov\/geocoder\/locations\/address\?/); assert.match(asked, /benchmark=Public_AR_Current/);
  assert.equal(await censusGeocoder(fake({ result: { addressMatches: [] } })).locate(CHI), null);
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c",
    STRIPE_SECRET_KEY: "k", STRIPE_IDENTITY_WEBHOOK_SECRET: "k", ACCOUNTS_OPEN: "yes", ASSETS: {} };
  assert.equal(backendFrom(env).geocoder, null);
  assert.ok(backendFrom({ ...env, GEOCODER_ON: "yes" }).geocoder);
});
