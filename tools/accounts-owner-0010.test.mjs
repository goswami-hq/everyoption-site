// Job platform-launch-0010 (his "1. Yes", HQ chat 2026-11-17 15:12 CT): the owner box on his account page, withdraw for
// doctors and for him, and the Preview-only fixture NPIs of the live test. Fixture NPIs only.
import test from "node:test";
import assert from "node:assert/strict";
import { world, ANN, BEN, CARA, GIL, DAN, EMAIL } from "./accounts-helpers.mjs";
import { exportConfirmed, makeService, OWNER_DAY } from "../lib/accounts/service.mjs";
import { handle } from "../lib/accounts/http.mjs";
import { localBackend } from "../lib/accounts/local.mjs";
import { fixturesOn, PREVIEW_FIXTURES, TEST_REF, PROD_REF } from "../lib/accounts/preview-fixtures.mjs";

const HAL = "1999000106", ALEK = "1999000114", IVY = "1999000122", TOM = "1999000130";
const tokOf = (url) => /#invite=([0-9a-f]{64})$/.exec(url)[1];
const card = async (w, npi) => (await exportConfirmed(w.backend)).find((x) => x.npi === npi);
const HEX64 = /[0-9a-f]{64}/;

// The owner: GIL signs up, gets full access by ID, and is marked owner the way the hand-edit tool does (is_owner).
async function owner(w, npi = GIL) {
  const c = await w.full(npi, EMAIL[npi] || `${npi}@home.example`);
  await w.backend.data.update("accounts", { npi }, { is_owner: true });
  return c;
}
const make = (c, body) => c.post("owner/invite", body);

test("the owner box is only for the owner: me says so, and every owner route refuses anyone else", async () => {
  const w = world();
  const gil = await owner(w);
  assert.equal((await gil.get("me")).body.owner, true);
  const ann = await w.full(ANN, EMAIL[ANN]);                       // full access, can invite, not the owner
  const ben = await w.signIn(BEN, EMAIL[BEN]);                     // partial
  const anon = w.client("10.10.9.9");
  for (const c of [ann, ben]) {
    assert.equal((await c.get("me")).body.owner, false);
    for (const [m, p, b] of [["GET", "owner/invites"], ["GET", `owner/check?npi=${CARA}`], ["POST", "owner/invite", { npi: CARA, kind: "full" }],
      ["POST", "owner/withdraw", { id: "invitations-1" }], ["POST", "owner/invite", { npi: TOM, kind: "full", trainee: true }]]) {
      const r = await c.call(m, p, b);
      assert.equal(r.status, 403, `${p} ${JSON.stringify(r.body)}`); assert.equal(r.body.error, "owner_only");
    }
  }
  assert.equal((await anon.get("owner/invites")).status, 401);
  assert.equal((await anon.post("owner/invite", { npi: CARA, kind: "full" })).status, 401);
  // an owner flag without a held NPI does nothing
  await w.backend.data.update("accounts", { npi: GIL }, { npi: null, lost_npi: GIL });
  assert.equal((await gil.get("owner/invites")).status, 403);
  assert.equal((await w.backend.data.many("invitations")).length, 0, "nothing made by anyone refused");
});

test("at most one owner: a second is refused (local stand-in of the partial unique index)", async () => {
  const w = world();
  await owner(w);
  await w.signIn(ANN, EMAIL[ANN]);
  await assert.rejects(w.backend.data.update("accounts", { npi: ANN }, { is_owner: true }), /conflict/);
  await assert.rejects(w.backend.data.update("accounts", {}, { is_owner: true }), /conflict/);
  assert.equal((await w.backend.data.many("accounts")).filter((a) => a.is_owner).length, 1);
});

test("the box's full invitation behaves as his command's: name first, full access, Confirmed, can invite; one edits row, one alert, no link", async () => {
  const w = world();
  const gil = await owner(w);
  const chk = await gil.get(`owner/check?npi=${CARA}`);
  assert.equal(chk.status, 200); assert.equal(chk.body.name, "Cara Newdoc"); assert.equal(chk.body.radiology, true); assert.equal(chk.body.held, false);
  const n0 = w.backend.alert.sent.length;
  const r = await make(gil, { npi: CARA, kind: "full" });
  assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.kind, "full"); assert.match(r.body.url, /\/account\/#invite=[0-9a-f]{64}$/);
  const inv = (await w.backend.data.many("invitations"))[0];
  assert.equal(inv.kind, "owner"); assert.equal(inv.inviter_account_id, null); assert.equal(inv.npi_name, "Cara Newdoc");
  const sent = w.backend.alert.sent.slice(n0);
  assert.equal(sent.length, 1); assert.match(sent[0], new RegExp(`invitation made for NPI ${CARA}, full, expires \\d{4}-\\d{2}-\\d{2}`));
  assert.doesNotMatch(sent[0], HEX64, "no link in the alert");
  const me = (await gil.get("me")).body;
  const ed = (await w.backend.data.many("edits", { npi: GIL })).filter((e) => e.field === "owner_invite");
  assert.equal(ed.length, 1); assert.equal(ed[0].after.npi, CARA); assert.equal(ed[0].account_id, me.account.id);
  const cara = w.client("10.10.2.2");
  const a = await cara.post("invite/accept", { token: tokOf(r.body.url), agree: true, procedures: ["ufe"], email: EMAIL[CARA] });
  assert.equal(a.status, 200); assert.equal(a.body.level, "full");
  const cm = (await cara.get("me")).body;
  assert.equal(cm.account.proof, "invite_owner"); assert.equal(cm.can.invite, true); assert.equal(cm.owner, false);
  assert.equal((await card(w, CARA)).confirmed, true);
  const list = (await gil.get("owner/invites")).body.invites;
  assert.equal(list[0].status, "used"); assert.equal(list[0].used_by.email, EMAIL[CARA]); assert.equal(list[0].name, "Cara Newdoc");
});

test("the box's published-email invitation behaves as his command's: partial, that email only, Likely, no invitations", async () => {
  const w = world();
  const gil = await owner(w);
  assert.equal((await make(gil, { npi: IVY, kind: "published" })).body.error, "invalid", "an email is needed");
  const r = await make(gil, { npi: IVY, kind: "published", email: "Ivy@PubTest-ir.example" });
  assert.equal(r.status, 201); assert.equal(r.body.kind, "partial");
  assert.match(w.backend.alert.sent.at(-1), /partial \(published email\)/);
  const ivy = w.client("10.10.3.3");
  assert.equal((await ivy.post("invite/accept", { token: tokOf(r.body.url), agree: true, email: "other@x.example" }, { raw: true })).body.error, "invite_email_fixed");
  const a = await ivy.post("invite/accept", { token: tokOf(r.body.url), agree: true });
  assert.equal(a.status, 200); assert.equal(a.body.level, "basic");
  const me = (await ivy.get("me")).body;
  assert.equal(me.account.email, "ivy@pubtest-ir.example"); assert.equal(me.can.invite, false);
  assert.equal(me.group, "likely");
});

test("the box keeps the command's refusals: own NPI, non-radiologist, not a person; a held NPI moves to whoever opens his link", async () => {
  const w = world();
  const gil = await owner(w);
  assert.equal((await make(gil, { npi: GIL, kind: "full" })).body.error, "invite_self");
  assert.equal((await make(gil, { npi: DAN, kind: "full" })).body.error, "not_radiologist");
  assert.equal((await make(gil, { npi: "1999000064", kind: "full" })).body.error, "npi_not_individual");
  assert.equal((await make(gil, { npi: "123", kind: "full" })).body.error, "invalid");
  assert.equal((await make(gil, { npi: CARA, kind: "doctor" })).body.error, "invalid");
  await w.signIn(BEN, EMAIL[BEN]);
  assert.equal((await gil.get(`owner/check?npi=${BEN}`)).body.held, true);
  const r = await make(gil, { npi: BEN, kind: "full" });
  assert.equal(r.status, 201); assert.equal(r.body.held, true);
});

test("the link is shown once: never in his list, me, or any later answer", async () => {
  const w = world();
  const gil = await owner(w);
  const r = await make(gil, { npi: CARA, kind: "full" });
  const tok = tokOf(r.body.url);
  for (const p of ["owner/invites", "me", "edits"]) {
    const txt = JSON.stringify((await gil.get(p)).body);
    assert.ok(!txt.includes(tok), p); assert.doesNotMatch(txt, HEX64, p);
  }
  const row = (await w.backend.data.many("invitations"))[0];
  assert.notEqual(row.token_hash, tok, "stored hashed");
});

test("withdraw: his link stops working with the usual page; listed as withdrawn; one edits row, no alert", async () => {
  const w = world();
  const gil = await owner(w);
  const r = await make(gil, { npi: CARA, kind: "full" });
  const n0 = w.backend.alert.sent.length;
  const wd = await gil.post("owner/withdraw", { id: r.body.id });
  assert.equal(wd.status, 200, JSON.stringify(wd.body));
  assert.equal(w.backend.alert.sent.length, n0, "no alert on withdraw");
  const x = w.client("10.10.4.4");
  assert.equal((await x.post("invite/preview", { token: tokOf(r.body.url) })).body.error, "invite_invalid");
  assert.equal((await x.post("invite/accept", { token: tokOf(r.body.url), agree: true, email: EMAIL[CARA] }, { raw: true })).body.error, "invite_invalid");
  assert.equal((await gil.get("owner/invites")).body.invites[0].status, "withdrawn");
  assert.equal((await gil.post("owner/withdraw", { id: r.body.id })).body.error, "invite_not_live");
  assert.equal((await w.backend.data.many("edits", { npi: GIL })).filter((e) => e.field === "invite_withdrawn").length, 1);
  // a code already sent before the withdraw does not finish
  const r2 = await make(gil, { npi: HAL, kind: "full" });
  const s = await x.post("invite/accept", { token: tokOf(r2.body.url), agree: true, email: "hal@home.example" }, { raw: true });
  assert.equal(s.status, 202);
  await gil.post("owner/withdraw", { id: r2.body.id });
  assert.equal((await x.post("code", { challenge: s.body.challenge, code: w.lastCode("hal@home.example") })).body.error, "invite_invalid");
  assert.equal((await w.backend.data.many("accounts", { npi: HAL })).length, 0);
});

test("withdraw for doctors: frees the slot; each side withdraws only its own", async () => {
  const w = world();
  const gil = await owner(w);
  const ann = await w.full(ANN, EMAIL[ANN]);
  const made = [];
  for (const npi of [BEN, CARA, HAL, ALEK, IVY]) made.push((await ann.post("invite/create", { npi })).body);
  assert.equal(made[4].left, 0);
  assert.equal((await ann.post("invite/create", { npi: GIL })).body.error, "invite_limit");
  const mine = (await ann.get("me")).body.invites.sent;
  assert.equal(mine.length, 5); assert.ok(mine.every((s) => s.status === "live" && s.id && s.name));
  assert.equal((await gil.post("owner/withdraw", { id: made[0].id })).status, 404, "the owner box does not reach a doctor's link");
  const ownerLink = await make(gil, { npi: DAN === "x" ? DAN : TOM, kind: "full", trainee: true });
  assert.equal(ownerLink.status, 201);
  assert.equal((await ann.post("invite/withdraw", { id: ownerLink.body.id })).status, 404, "a doctor does not reach his link");
  const n0 = w.backend.alert.sent.length;
  const wd = await ann.post("invite/withdraw", { id: made[0].id });
  assert.equal(wd.status, 200);
  assert.equal(w.backend.alert.sent.length, n0, "no alert");
  const me = (await ann.get("me")).body.invites;
  assert.equal(me.left, 1); assert.equal(me.sent.find((s) => s.id === made[0].id).status, "withdrawn");
  assert.equal((await w.client("10.10.5.5").post("invite/preview", { token: tokOf(made[0].url) })).body.error, "invite_invalid");
  assert.equal((await ann.post("invite/create", { npi: GIL })).status, 201, "the freed slot takes a new link");
  assert.equal((await w.backend.data.many("edits", { npi: ANN })).filter((e) => e.field === "invite_withdrawn").length, 1);
  // a used link cannot be withdrawn
  const ben = w.client("10.10.5.6");
  await ben.post("invite/accept", { token: tokOf(made[1].url), agree: true, email: EMAIL[BEN] });
  assert.equal((await ann.post("invite/withdraw", { id: made[1].id })).body.error, "invite_not_live");
  assert.equal((await ann.post("invite/withdraw", { id: "not-an-id" })).status, 404);
  assert.equal((await w.signIn(DAN === "x" ? DAN : "1999000080", "anna@x.example").then((c) => c.post("invite/withdraw", { id: made[2].id }))).status, 404);
});

test("30 owner invitations a day; the 31st is refused; refused attempts do not count; the next day starts again", async () => {
  const w = world();
  const gil = await owner(w);
  assert.equal(OWNER_DAY, 30);
  w.clock.t = Date.parse("2026-11-02T00:10:00Z");
  const again = await w.signIn(GIL, EMAIL[GIL]);                   // a fresh session after the clock moved
  for (let i = 0; i < 5; i++) assert.equal((await make(again, { npi: DAN, kind: "full" })).body.error, "not_radiologist");
  for (let i = 0; i < 30; i++) { const r = await make(again, { npi: CARA, kind: "full" }); assert.equal(r.status, 201, `#${i + 1} ${JSON.stringify(r.body)}`); }
  const r31 = await make(again, { npi: CARA, kind: "full" });
  assert.equal(r31.status, 429); assert.equal(r31.body.error, "owner_day_limit");
  assert.equal((await w.backend.data.many("invitations")).length, 30);
  w.clock.t = Date.parse("2026-11-03T00:10:00Z");
  const next = await w.signIn(GIL, EMAIL[GIL]);
  assert.equal((await make(next, { npi: CARA, kind: "full" })).status, 201);
  void gil;
});

test("the trainee tick: only on his full invitation, only for a registry entry with only the trainee code", async () => {
  const w = world();
  const gil = await owner(w);
  assert.equal((await gil.get(`owner/check?npi=${TOM}`)).body.trainee_only, true);
  assert.equal((await make(gil, { npi: TOM, kind: "full" })).body.error, "not_radiologist", "off by default");
  assert.equal((await make(gil, { npi: TOM, kind: "published", email: "tom@x.example", trainee: true })).body.error, "invalid");
  const r = await make(gil, { npi: TOM, kind: "full", trainee: true });
  assert.equal(r.status, 201); assert.equal(r.body.trainee, true);
  assert.match(w.backend.alert.sent.at(-1), /full \(registry shows a trainee code only\)/);
  assert.equal((await make(gil, { npi: DAN, kind: "full", trainee: true })).body.error, "not_radiologist", "not a trainee-only entry");
  const ann = await w.full(ANN, EMAIL[ANN]);
  assert.equal((await ann.post("invite/create", { npi: TOM, trainee: true })).body.error, "not_radiologist", "a doctor's invitation keeps the rule");
  assert.equal((await ann.post("owner/invite", { npi: TOM, kind: "full", trainee: true })).body.error, "owner_only");
});

// ---- The Preview-only fixture NPIs (lib/accounts/preview-fixtures.mjs). Fail closed.
const TEST_URL = `https://${TEST_REF}.supabase.co`, PREVIEW = "https://every-option-job-5.everyoption-site.pages.dev/api/account/me";

test("fixturesOn: on only for a Pages preview host with the test project; any doubt means off", () => {
  assert.equal(fixturesOn({ SUPABASE_URL: TEST_URL }, PREVIEW), true);
  assert.equal(fixturesOn({ SUPABASE_URL: TEST_URL + "/" }, PREVIEW), true);
  assert.equal(fixturesOn({ SUPABASE_URL: TEST_URL, CF_PAGES_BRANCH: "every-option-job-5" }, PREVIEW), true);
  assert.equal(fixturesOn({ SUPABASE_URL: TEST_URL }, "https://3f2a91bc.everyoption-site.pages.dev/api/account/me"), true);
  const off = [
    [{ SUPABASE_URL: `https://${PROD_REF}.supabase.co` }, PREVIEW, "production project"],
    [{ SUPABASE_URL: TEST_URL }, "https://everyoptionmd.com/api/account/me", "custom domain"],
    [{ SUPABASE_URL: TEST_URL }, "https://www.everyoptionmd.com/api/account/me", "www"],
    [{ SUPABASE_URL: TEST_URL }, "https://everyoption-site.pages.dev/api/account/me", "bare production pages.dev"],
    [{ SUPABASE_URL: TEST_URL }, "http://every-option-job-5.everyoption-site.pages.dev/api/account/me", "http"],
    [{ SUPABASE_URL: TEST_URL }, "https://every-option-job-5.everyoption-site.pages.dev:8443/x", "port"],
    [{ SUPABASE_URL: TEST_URL }, "https://a.b.everyoption-site.pages.dev/x", "nested host"],
    [{ SUPABASE_URL: TEST_URL }, "https://every-option-job-5.everyoption-site.pages.dev.evil.example/x", "lookalike host"],
    [{ SUPABASE_URL: TEST_URL, CF_PAGES_BRANCH: "main" }, PREVIEW, "branch main"],
    [{ SUPABASE_URL: TEST_URL, CF_PAGES_BRANCH: 5 }, PREVIEW, "odd branch value"],
    [{}, PREVIEW, "no database URL"],
    [{ SUPABASE_URL: "" }, PREVIEW, "empty database URL"],
    [{ SUPABASE_URL: "not a url" }, PREVIEW, "bad database URL"],
    [{ SUPABASE_URL: `http://${TEST_REF}.supabase.co` }, PREVIEW, "http database"],
    [{ SUPABASE_URL: `https://${TEST_REF}.supabase.co.evil.example` }, PREVIEW, "lookalike database"],
    [{ SUPABASE_URL: `https://${TEST_REF}.supabase.co/rest/v1` }, PREVIEW, "database URL with a path"],
    [{ SUPABASE_URL: `https://x:y@${TEST_REF}.supabase.co` }, PREVIEW, "database URL with credentials"],
    [{ SUPABASE_URL: `https://${TEST_REF}.supabase.co:444` }, PREVIEW, "database port"],
    [{ SUPABASE_URL: TEST_URL, backend: {} }, PREVIEW, "a test backend"],
    [null, PREVIEW, "no env"],
    [{ SUPABASE_URL: TEST_URL }, "", "no request URL"],
  ];
  for (const [env, u, why] of off) assert.equal(fixturesOn(env, u), false, why);
});

test("fixtures answer only when the switch is on and the registry knows nothing; the switch is never read from a variable", async () => {
  const npi = Object.keys(PREVIEW_FIXTURES)[0];
  const empty = () => localBackend({ nppes: {}, listings: {}, radiologists: {} });
  const ctx = { ip: "10.1.1.1" };
  await assert.rejects(makeService(empty(), {}).lookup(npi, ctx), /npi_not_individual/);
  await assert.rejects(makeService(empty(), { previewFixtures: "true" }).lookup(npi, ctx), /npi_not_individual/, "a string is not the switch");
  assert.equal((await makeService(empty(), { previewFixtures: true }).lookup(npi, ctx)).name, "Fixture Alpha");
  await assert.rejects(makeService(empty(), { previewFixtures: true }).lookup("1999000031", ctx), /npi_not_individual/, "only the listed NPIs");
  // a real registry answer always wins
  const real = localBackend({ nppes: { [npi]: { type: "NPI-1", first: "Real", last: "Person", taxonomy: "2085R0204X" } }, listings: {}, radiologists: {} });
  assert.equal((await makeService(real, { previewFixtures: true }).lookup(npi, ctx)).name, "Real Person");
  // through the HTTP layer: a Pages variable named previewFixtures is overridden by the computed switch (off here)
  for (const v of [true, "true", "yes"]) {
    const r = await handle(new Request(`https://every-option-job-5.everyoption-site.pages.dev/api/account/lookup?npi=${npi}`,
      { headers: { "CF-Connecting-IP": "10.1.1.2" } }), { backend: empty(), previewFixtures: v, SUPABASE_URL: TEST_URL });
    assert.equal((await r.json()).error, "npi_not_individual", `env previewFixtures=${v}`);
  }
});

test("the doctor box lists its links with status, newest first, and shows no link", async () => {
  const w = world();
  const ann = await w.full(ANN, EMAIL[ANN]);
  const a = await ann.post("invite/create", { npi: BEN });
  w.clock.t += 60000;
  await ann.post("invite/create", { npi: CARA });
  const sent = (await ann.get("me")).body.invites.sent;
  assert.deepEqual(sent.map((s) => s.npi), [CARA, BEN]);
  assert.equal(sent[1].name, "Ben Sampletwo");
  assert.doesNotMatch(JSON.stringify(sent), HEX64);
  void a;
});
