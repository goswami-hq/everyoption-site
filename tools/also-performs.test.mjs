// Job platform-directory-0036: procedures a doctor performs that are not on the site yet. node --test tools/also-performs.test.mjs
// His words (2026-11-13 12:13 CT): "we should have a ton of other procedures as a separate check box (labeled not added yet
// or something) that they can choose from". Private: it lists nobody, attests nothing and never leaves the database except
// to the doctor's own account page. The tick list is read from content/upcoming-procedures.json, never typed here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { world, ANN, EMAIL } from "./accounts-helpers.mjs";
import { exportConfirmed } from "../lib/accounts/service.mjs";
import { overlayFor } from "../lib/accounts/listings.mjs";
import { supabaseData } from "../lib/accounts/supabase.mjs";
import { mergeDoctor, render } from "../lib/directory.mjs";
import { mergeOverlay as cityMerge, card as cityCard } from "../lib/cities.mjs";
import { UPCOMING_GROUPS, UPCOMING_SLUGS } from "../lib/upcoming.mjs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const CONTENT = JSON.parse(read("content/upcoming-procedures.json"));
const KEYS = JSON.parse(read("content/procedure-keys.json"));
// The tick list as the content file gives it: every item without promoted_to, in file order.
const LIST = CONTENT.groups.flatMap((g) => g.items.filter((i) => !i.promoted_to).map((i) => i.slug));
const ITEMS = Object.fromEntries(CONTENT.groups.flatMap((g) => g.items).map((i) => [i.slug, i]));
const [S1, S2, S3] = [LIST[0], LIST[Math.floor(LIST.length / 2)], LIST[LIST.length - 1]];
const OFF = { practice: "Lakeside IR", street: "100 Test Plaza", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" };
const MARK = "Qzxv private marker procedure";   // a "Something else" line no public output may carry
const settle = () => new Promise((r) => setTimeout(r, 5));
const prof = async (w) => w.backend.data.one("profiles", { npi: ANN });

test("the server copy is the content file: same items, same order; nothing promoted on the list", () => {
  assert.deepEqual(UPCOMING_SLUGS, LIST);
  assert.deepEqual(UPCOMING_GROUPS.map((g) => g.name), CONTENT.groups.filter((g) => g.items.some((i) => !i.promoted_to)).map((g) => g.name));
  for (const g of UPCOMING_GROUPS) for (const i of g.items) assert.deepEqual(i, { slug: i.slug, name: ITEMS[i.slug].name, for: ITEMS[i.slug].for });
  for (const s of LIST) assert.ok(!KEYS.issued.includes(s), `${s} is a procedure key`);
});

test("also_performs: slugs from the tick list only, saved once each in list order; anything else refused", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  const ok = await c.put("profile", { also_performs: [S3, S1, S2, S1] });
  assert.equal(ok.status, 200); assert.deepEqual(ok.body.changed, ["also_performs"]);
  assert.deepEqual((await prof(w)).also_performs, [S1, S2, S3], "unique and in list order");
  assert.deepEqual((await c.get("me")).body.profile.also_performs, [S1, S2, S3], "the doctor sees their ticks");
  assert.deepEqual((await c.put("profile", { also_performs: [S1, S2, S3] })).body.changed, [], "same ticks: no change");
  assert.equal((await c.put("profile", { also_performs: LIST })).status, 200, "the whole list is allowed");
  for (const bad of [KEYS.issued[0], "not-a-slug", S1.toUpperCase(), 1, null, { s: S1 }, ""]) {
    const r = await c.put("profile", { also_performs: [S1, bad] });
    assert.equal(r.status, 400, JSON.stringify(bad)); assert.deepEqual(r.body.fields, ["also_performs"]);
  }
  for (const bad of [S1, {}, null, true, Array(101).fill(S1)]) {
    const r = await c.put("profile", { also_performs: bad });
    assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 40)); assert.deepEqual(r.body.fields, ["also_performs"]);
  }
  assert.deepEqual((await prof(w)).also_performs, LIST, "a refused save changes nothing");
  assert.deepEqual((await prof(w)).attested, ["ufe"], "a tick never attests");
  assert.equal((await c.put("profile", { also_performs: [] })).status, 200);
  assert.deepEqual((await prof(w)).also_performs, []);
});

test("also_performs_other: like insurance_other, 120 characters, through the screen", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  assert.equal((await c.put("profile", { also_performs_other: "  Splenic   artery embolization " })).status, 200);
  assert.equal((await prof(w)).also_performs_other, "Splenic artery embolization", "spaces tidied");
  assert.equal((await c.put("profile", { also_performs_other: "x".repeat(120) })).status, 200, "120 is allowed");
  const long = await c.put("profile", { also_performs_other: "x".repeat(121) });
  assert.equal(long.status, 400); assert.deepEqual(long.body.fields, ["also_performs_other"]);
  for (const bad of [5, null, ["a"], { a: 1 }]) assert.equal((await c.put("profile", { also_performs_other: bad })).status, 400, JSON.stringify(bad));
  const link = await c.put("profile", { also_performs_other: "see https://example.com/x" });
  assert.equal(link.status, 422); assert.ok(link.body.blocked.also_performs_other.length, "the screen names why");
  assert.equal((await c.put("profile", { also_performs_other: "" })).status, 200);
  assert.equal((await prof(w)).also_performs_other, "");
});

test("partial access saves both; no alert, no email; undo puts back what was there", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  await c.put("profile", { offices: [OFF] }); await settle();
  const sent = w.backend.alert.sent.length, mails = w.outbox.length;
  assert.equal((await c.put("profile", { also_performs: [S1] })).status, 200);
  assert.equal((await c.put("profile", { also_performs: [S1, S2], also_performs_other: MARK })).status, 200); await settle();
  assert.equal(w.backend.alert.sent.length, sent, "no alert"); assert.equal(w.outbox.length, mails, "no email");
  const edits = (await c.get("edits")).body.edits;
  const e = edits.find((x) => x.field === "also_performs"), o = edits.find((x) => x.field === "also_performs_other");
  assert.ok(e && e.undoable && e.by_you && o && o.undoable);
  assert.deepEqual(e.before, [S1]); assert.deepEqual(e.after, [S1, S2]);
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200);
  assert.deepEqual((await prof(w)).also_performs, [S1], "undo restores the earlier ticks");
  assert.equal((await c.post("undo", { edit_id: o.id })).status, 200);
  assert.equal((await prof(w)).also_performs_other, "", "undo restores the empty line");
  const first = (await c.get("edits")).body.edits.find((x) => x.field === "also_performs" && !x.undo_of && x.undoable);
  assert.equal((await c.post("undo", { edit_id: first.id })).status, 200);
  assert.deepEqual((await prof(w)).also_performs, [], "back to the default");
});

test("an undo restores only slugs still on the tick list", async () => {
  const w = world(), c = await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  await c.put("profile", { also_performs: [S1] });
  await c.put("profile", { also_performs: [S2] });
  // A slug that has left the list since (promoted, say), planted in the logged "before".
  const e = (await w.backend.data.many("edits", { npi: ANN })).filter((x) => x.field === "also_performs").pop();
  await w.backend.data.update("edits", { id: e.id }, { before: [S1, "gone-from-the-list"] });
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200);
  assert.deepEqual((await prof(w)).also_performs, [S1]);
});

test("a takeover empties both, logged and undoable", async () => {
  const w = world(), squat = w.client("10.7.0.1");
  await squat.post("invite/accept", { token: await w.invite(ANN, "owner"), agree: true, procedures: ["ufe"] });
  assert.equal((await squat.put("profile", { also_performs: [S1, S2], also_performs_other: MARK })).status, 200);
  const real = w.client("10.7.0.2");
  const s = await real.post("signup", { specialty: "ir", npi: ANN, email: "ann@home.example", agree: true, procedures: ["ufe"] });
  await real.post("code", { challenge: s.body.challenge, code: w.lastCode("ann@home.example") });
  assert.equal((await w.idCheck(real)).takeover, true);
  const p = await prof(w);
  assert.deepEqual(p.also_performs, []); assert.equal(p.also_performs_other, "");
  const mine = (await real.get("edits")).body.edits.filter((e) => e.by_you);
  for (const f of ["also_performs", "also_performs_other"]) assert.ok(mine.find((e) => e.field === f && e.undoable), `${f} reset logged and undoable`);
});

test("a new profile starts with both empty", async () => {
  const w = world(); await w.signIn(ANN, EMAIL[ANN], undefined, ["ufe"]);
  const p = await prof(w);
  assert.deepEqual(p.also_performs, []); assert.equal(p.also_performs_other, "");
});

// ---- The leak test. Seen failing first with also_performs planted in the overlay select of lib/accounts/supabase.mjs
// (run log, ai-hq records/runs/2026-11-13-account-private-ticks-for-procedures-not-on-the-site-yet.md).
// A stand-in for PostgREST: it answers the overlay request from the local rows, giving only the columns the select names,
// so a column added to the select reaches the overlay exactly as it would from Supabase.
function postgrest(w) {
  const pick = (row, cols) => Object.fromEntries(cols.filter((k) => k in row).map((k) => [k, row[k]]));
  return async (url) => {
    const u = new URL(url), sel = u.searchParams.get("select"), off = Number(u.searchParams.get("offset") || 0);
    const top = sel.slice(0, sel.indexOf("accounts(")).split(",").filter(Boolean);
    const acols = sel.slice(sel.indexOf("accounts(") + 9, sel.indexOf(",attestations(")).split(",");
    const rows = (await w.backend.data.many("profiles")).slice(off, off + 1000).map(async (p) => {
      const a = await w.backend.data.one("accounts", { id: p.account_id });
      const at = a ? (await w.backend.data.many("attestations", { account_id: a.id })).map((x) => ({ npi: x.npi, procedure: x.procedure })) : [];
      return { ...pick(p, top), accounts: a ? { ...pick(a, acols), attestations: at } : null };
    });
    return new Response(JSON.stringify(await Promise.all(rows)), { status: 200 });
  };
}
const leaks = (label, v) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  assert.doesNotMatch(s, /also_performs/, `${label}: names the field`);
  assert.ok(!s.includes(MARK), `${label}: carries the "Something else" line`);
  for (const sl of [S1, S2]) {
    assert.ok(!s.includes(sl), `${label}: carries the tick ${sl}`);
    assert.ok(!s.includes(ITEMS[sl].name), `${label}: carries the name of the tick ${sl}`);
  }
};

test("leak: neither field reaches the overlay, the listings, the export, a profile page, a city page or site/data", async () => {
  const w = world(), c = await w.full(ANN);
  await c.put("profile", { offices: [OFF], also_performs: [S1, S2], also_performs_other: MARK });
  assert.deepEqual((await prof(w)).also_performs, [S1, S2], "the ticks are saved");
  const sb = supabaseData("https://db.example", "test-key", postgrest(w));
  const rows = await sb.overlay();
  assert.ok(rows.some((r) => r.npi === ANN), "the stand-in answers the overlay");
  leaks("the overlay (Supabase select)", rows);
  for (const backend of [{ ...w.backend, data: { ...w.backend.data, overlay: () => sb.overlay() } }, w.backend]) {
    const ov = await overlayFor(backend, "ufe");
    assert.ok(ov.people.some((p) => p.npi === ANN), "the doctor is listed");
    leaks("the listings", ov);
    const doc = mergeDoctor(ANN, null, { ufe: ov });
    leaks("the profile record", doc);
    leaks("the profile page", render(ANN, doc, { claimed: true }));
    const city = cityMerge([], ov);
    leaks("the city merge", city);
    leaks("the city card", cityCard({ ...city.find((p) => p.npi === ANN), miles: 2 }, "ufe"));
  }
  leaks("exportConfirmed", await exportConfirmed(w.backend));
  const dir = new URL("../site/data/", import.meta.url).pathname;
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")))
    assert.doesNotMatch(readFileSync(dir + f, "utf8"), /also_performs/, `site/data/${f} names the field`);
});

test("leak: no public code names either field", () => {
  const src = read("lib/accounts/supabase.mjs");
  const ov = src.slice(src.indexOf("async overlay()"));
  const sel = ov.slice(ov.indexOf("profiles?select="), ov.indexOf("&order=npi"));   // the whole select, across its two string pieces
  assert.match(sel, /telehealth/, "found the overlay select");
  assert.doesNotMatch(sel, /also_performs/, "the overlay select");
  for (const f of ["lib/accounts/listings.mjs", "lib/directory.mjs", "lib/cities.mjs", "tools/directory.py", "src-assets/finder.js"])
    assert.doesNotMatch(read(f), /also_performs/, f);
  const svc = read("lib/accounts/service.mjs");
  const exp = svc.slice(svc.indexOf("export async function exportConfirmed"));
  assert.doesNotMatch(exp, /also_performs/, "exportConfirmed");
  assert.match(svc, /const CONTACT = \["booking_url", "offices"\];/, "not a contact field");
  assert.match(svc, /const FULL_ONLY = \["photo"\];/, "not full-access only");
  const aihq = process.env.AI_HQ || `${homedir()}/ai-hq`;
  const ex = `${aihq}/scripts/every_option_export.py`;
  if (existsSync(ex)) assert.doesNotMatch(readFileSync(ex, "utf8"), /also_performs/, "ai-hq scripts/every_option_export.py");
});

test("database: two columns with empty defaults and checks; migration and schema.sql in step", () => {
  const sql = read("supabase/schema.sql"), mig = read("supabase/migrations/2026-11-13-also-performs.sql");
  assert.match(sql, /also_performs jsonb not null default '\[\]'/);
  assert.match(sql, /also_performs_other text not null default ''/);
  assert.match(mig, /add column if not exists also_performs jsonb not null default '\[\]';/);
  assert.match(mig, /add column if not exists also_performs_other text not null default '';/);
  const norm = (s) => s.replace(/\s+/g, " ");
  const chk = (s, name) => norm(new RegExp(`constraint ${name} check \\((.*?)\\)(?:,|;)\\s*(?:\\n|$)`, "s").exec(s)[1]);
  for (const n of ["profiles_also_performs_check", "profiles_also_performs_other_check"]) assert.equal(chk(sql, n), chk(mig, n), n);
  assert.match(chk(mig, "profiles_also_performs_check"), /jsonb_typeof\(also_performs\) = 'array' and jsonb_array_length\(also_performs\) <= 100/);
  assert.match(chk(mig, "profiles_also_performs_other_check"), /length\(also_performs_other\) <= 120/);
  assert.doesNotMatch(mig.replace(/^--.*$/gm, ""), /\b(update|delete|truncate|drop column|drop table)\b/i, "never rewrites data");
  for (const s of mig.replace(/^--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean))
    assert.match(s, /^alter table profiles (add column if not exists|drop constraint if exists|add constraint)/, "safe to run twice: " + s);
});

test("the browser copy is the content file, and the account page loads it", () => {
  const built = read("site/assets/upcoming.js");
  const U = new Function("window", built + "\nreturn window.EO_UPCOMING;")({});
  assert.deepEqual(U.groups, UPCOMING_GROUPS);
  assert.match(read("site/account/index.html"), /\/assets\/upcoming\.js\?v=/);
  const procs = new Function("window", read("site/assets/procedures.js") + "\nreturn window.EO_PROCS;")({});
  const pel = JSON.parse(read("content/procedures.json")).find((p) => p.key === "pelvic");
  assert.ok(!("account_sub" in pel), "no grey line: the name carries both procedures (his words 2026-11-14 00:38 CT)");
  assert.equal(procs.sub.pelvic, undefined, "no grey line in the browser copy");
});

test("the account section: its wording, no 'Add', one Save", () => {
  const js = read("src-assets/account.js");
  const a = js.slice(js.indexOf("function alsoForm("), js.indexOf("function officePanel("));
  assert.ok(a.includes('"Other procedures you perform (not on the site yet)"'));
  assert.ok(a.includes('"Private. This does not list you and does not add a procedure to your listing. It tells us what to add next. When one goes live, we will ask you to confirm it."'));
  const visible = [...a.matchAll(/text: "([^"]*)"/g)].map((m) => m[1]);
  for (const t of visible.filter((t) => !t.startsWith("Private."))) assert.doesNotMatch(t, /\badd\b/i, t);
  assert.equal((a.match(/type: "submit"/g) || []).length, 1, "one Save button");
  assert.doesNotMatch(a, /search/i, "no search box");
  const pel = JSON.parse(read("content/procedures.json")).find((p) => p.key === "pelvic");
  // Job platform-directory-0037 (his words 2026-11-14 00:38 CT: "Put the procedures together"): the name carries both.
  for (const f of ["name", "short", "patient_name", "hub_label"]) assert.match(String(pel[f] || ""), /^pelvic vein embolization and stenting/i, `pelvic ${f}`);
});
