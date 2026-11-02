// node --test tools/report.test.mjs      (job 19: the report-an-error form, /claim/ forwarding, the one procedure list)
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { onRequestPost, validate, npiOk, REASONS } from "../functions/api/report.js";
import { PROCEDURES, PROCS } from "../lib/procedures.mjs";
import { PROCS as ACCOUNT_PROCS } from "../lib/accounts/util.mjs";
import { PROC_NAMES } from "../lib/accounts/service.mjs";

function kv() {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); } };
}
const good = { submission_id: "s1", listing: "1234567893", procedure: "ufe", doctor: "Ann Example", reason: "contact",
  note: "The phone number rings a different office.", email: "", website: "" };
const post = (env, body, ip = "1.2.3.4", raw) => onRequestPost({ env, request: new Request("http://x/api/report", {
  method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: raw ?? JSON.stringify(body) }) });
const reports = (env) => [...env.CLAIMS.m.keys()].filter((k) => k.startsWith("report:"));

test("NPI check digit", () => { assert.ok(npiOk("1234567893")); assert.ok(!npiOk("1234567890")); assert.ok(!npiOk("12345")); });
test("the four choices, in order", () => assert.deepEqual(REASONS, ["not_performed", "contact", "moved", "other"]));
test("no store bound: 503, nothing stored", async () => { const r = await post({}, good); assert.equal(r.status, 503); });

test("valid send from a card: stored once, email optional", async () => {
  const env = { CLAIMS: kv() }; const r = await post(env, good); assert.equal(r.status, 201);
  assert.equal(reports(env).length, 1);
  const rec = JSON.parse(env.CLAIMS.m.get(reports(env)[0]));
  assert.equal(rec.reason, "contact"); assert.equal(rec.listing, "1234567893"); assert.equal(rec.procedure, "ufe");
  assert.equal(rec.changes_listing, false);
  assert.ok(!JSON.stringify(rec).includes("1.2.3.4"), "raw IP never stored");
  assert.ok(!("ip_hash" in rec), "no IP hash in the record");
  for (const gone of ["role", "npi", "practice", "city", "state", "procedures", "name"]) assert.ok(!(gone in rec), gone);
});
test("valid send with no link: a typed doctor name and an email", async () => {
  const env = { CLAIMS: kv() };
  const r = await post(env, { reason: "moved", doctor: "Bob Sample", email: "me@example.org", submission_id: "t1" });
  assert.equal(r.status, 201); assert.equal(reports(env).length, 1);
});
test("missing choice: 400 names reason, nothing stored", async () => {
  const env = { CLAIMS: kv() }; const r = await post(env, { ...good, reason: "" });
  assert.equal(r.status, 400); assert.deepEqual((await r.json()).fields, ["reason"]); assert.equal(reports(env).length, 0);
  const r2 = await post(env, { ...good, reason: "staff" });          // not one of the four
  assert.equal(r2.status, 400); assert.equal(reports(env).length, 0);
});
test("no link and no doctor name: 400 names doctor", async () => {
  const r = await post({ CLAIMS: kv() }, { reason: "other", doctor: "" }); assert.equal(r.status, 400);
  assert.deepEqual((await r.json()).fields, ["doctor"]);
});
test("bad email or listing: 400 with names", async () => {
  const r = await post({ CLAIMS: kv() }, { ...good, email: "nope", listing: "1234567890" });
  assert.equal(r.status, 400); const j = await r.json();
  for (const f of ["email", "listing"]) assert.ok(j.fields.includes(f), f);
});
test("unknown procedure dropped, not stored", () => assert.equal(validate({ ...good, procedure: "xyz" }).clean.procedure, ""));
test("rate limit: 6th in an hour is 429, 5 stored", async () => {
  const env = { CLAIMS: kv() }; let last;
  for (let i = 0; i < 6; i++) last = await post(env, { ...good, submission_id: "r" + i, note: "n" + i });
  assert.equal(last.status, 429); assert.equal(reports(env).length, 5);
  assert.equal((await post(env, { ...good, submission_id: "other-ip", note: "x" }, "5.6.7.8")).status, 201, "another connection is not limited");
});
test("no listing change: a report writes only report, limit and duplicate keys, and touches no other store", async () => {
  const listings = kv(), accounts = kv();
  listings.m.set("1234567893", JSON.stringify({ phone: "312-555-0100", procedures: ["ufe"] }));
  const before = JSON.stringify([...listings.m]);
  const env = { CLAIMS: kv(), LISTINGS: listings, ACCOUNTS: accounts, DB: listings };
  for (const reason of REASONS) assert.equal((await post(env, { ...good, reason, submission_id: reason })).status, 201);
  assert.equal(JSON.stringify([...listings.m]), before); assert.equal(accounts.m.size, 0);
  assert.ok([...env.CLAIMS.m.keys()].every((k) => /^(report|rl|dup):/.test(k)), [...env.CLAIMS.m.keys()].join(" "));
  const src = readFileSync(new URL("../functions/api/report.js", import.meta.url), "utf8");
  assert.ok(!/env\.(?!CLAIMS\b)[A-Z_]+/.test(src), "the endpoint reads no binding but CLAIMS");
});
test("same submission id twice: one record", async () => {
  const env = { CLAIMS: kv() }; await post(env, good); const r = await post(env, good);
  assert.equal(r.status, 200); assert.equal((await r.json()).duplicate, true); assert.equal(reports(env).length, 1);
});
test("same content, new id: one record", async () => {
  const env = { CLAIMS: kv() }; await post(env, good); await post(env, { ...good, submission_id: "s2" });
  assert.equal(reports(env).length, 1);
});
test("size cap: over 8 KB is 413", async () => {
  const r = await post({ CLAIMS: kv() }, null, "1.1.1.1", JSON.stringify({ ...good, note: "x".repeat(9000) })); assert.equal(r.status, 413);
});
test("bad JSON: 400", async () => { const r = await post({ CLAIMS: kv() }, null, "9.9.9.9", "{nope"); assert.equal(r.status, 400); });
test("honeypot: answers ok, stores nothing", async () => {
  const env = { CLAIMS: kv() }; const r = await post(env, { ...good, website: "spam.example" });
  assert.equal(r.status, 200); assert.equal(env.CLAIMS.m.size, 0);
});
test("store failure: 500 and an error line without details", async () => {
  const m = kv(); const env = { CLAIMS: { ...m, get: m.get, async put(k, v) { if (k.startsWith("report:")) throw new Error("kv down"); return m.put(k, v); } } };
  const r = await post(env, { ...good, email: "ann@example.org" }); assert.equal(r.status, 500);
  const errs = [...m.m.entries()].filter(([k]) => k.startsWith("err:")); assert.equal(errs.length, 1);
  assert.ok(!errs[0][1].includes("ann@example.org"));
});

test("one procedure list: every copy matches content/procedures.json", () => {
  const src = JSON.parse(readFileSync(new URL("../content/procedures.json", import.meta.url), "utf8"));
  assert.deepEqual(PROCEDURES, src);
  assert.deepEqual(PROCS, ["ufe", "pae", "gae"]); assert.deepEqual(ACCOUNT_PROCS, PROCS);
  assert.equal(PROC_NAMES.gae, "genicular artery embolization (GAE)");
  const browser = readFileSync(new URL("../site/assets/procedures.js", import.meta.url), "utf8");
  const w = {}; new Function("window", browser)(w);
  assert.deepEqual(w.EO_PROCS.keys, PROCS); assert.equal(w.EO_PROCS.long.ufe, "Uterine fibroid embolization (UFE)");
  const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("check (procedure in ('ufe', 'pae', 'gae'))"));
  for (const f of ["../site/assets/account.js", "../site/assets/finder.js", "../functions/api/report.js", "../lib/accounts/util.mjs",
    "../lib/accounts/service.mjs", "../lib/accounts/vendors.mjs"]) {
    const t = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/\[\s*"ufe",\s*"pae",\s*"gae"\s*\]|ufe:\s*"/.test(t), f + " keeps its own procedure list");
  }
});

test("/claim/ forwards to /report/ with its query string (local server reads site/_redirects)", async () => {
  const port = 8799;
  const srv = spawn(process.execPath, [new URL("./dev-server.mjs", import.meta.url).pathname, String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise((ok) => srv.stdout.once("data", ok));
    for (const [from, to] of [["/claim/?npi=1234567893&procedure=pae&name=Ann%20Example", "/report/?npi=1234567893&procedure=pae&name=Ann%20Example"],
      ["/claim", "/report/"], ["/claim/", "/report/"]]) {
      const r = await fetch(`http://localhost:${port}${from}`, { redirect: "manual" });
      assert.equal(r.status, 301, from); assert.equal(r.headers.get("location"), to, from);
    }
    assert.equal((await fetch(`http://localhost:${port}/report/`)).status, 200);
    assert.equal((await fetch(`http://localhost:${port}/api/claim`, { method: "POST", body: "{}" })).status, 404, "old endpoint gone");
    const redirects = readFileSync(new URL("../site/_redirects", import.meta.url), "utf8");
    assert.match(redirects, /^\/claim\/ \/report\/ 301$/m); assert.match(redirects, /^\/claim \/report\/ 301$/m);
  } finally { srv.kill(); }
});
