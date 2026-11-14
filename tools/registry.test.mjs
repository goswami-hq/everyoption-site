// The procedure registry's permanent rules (ai-hq job platform-directory-0032, procedure registry job 1 of 4; plan
// review item 3): a key once issued never disappears or changes, and reserved words are never keys.
// node --test tools/registry.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const json = (p) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), "utf8"));
const KEYS = json("procedure-keys.json"), PROCEDURES = json("procedures.json"), CONDITIONS = json("conditions.json");
// The keys issued before the registry existed (site 9fd978c, 2026-11-11). This list only ever grows at its end, here
// and in content/procedure-keys.json; a test edit that shortens it is a change to permanent identifiers.
const ISSUED_BEFORE = ["ufe", "pae", "gae", "pelvic", "hae"];
const WORDS = ["api", "doctors", "data", "assets", "account", "insurance", "report"];

test("issued keys: append-only, every one kept in place and unchanged", () => {
  assert.deepEqual(KEYS.issued.slice(0, ISSUED_BEFORE.length), ISSUED_BEFORE, "an issued key disappeared, moved or changed");
  assert.equal(new Set(KEYS.issued).size, KEYS.issued.length, "an issued key is listed twice");
  for (const p of PROCEDURES) assert.ok(KEYS.issued.includes(p.key), `${p.key}: a procedure key that was never issued; append it to content/procedure-keys.json`);
  for (const k of KEYS.issued) assert.ok(PROCEDURES.some((p) => p.key === k), `${k}: an issued key with no procedure entry (retire it with a stage, never delete it)`);
});

test("reserved words are refused as keys, and none is ever dropped from the list", () => {
  for (const w of WORDS) assert.ok(KEYS.reserved.includes(w), `${w} left the reserved list`);
  const site = new URL("../site/", import.meta.url).pathname;
  const folders = readdirSync(site).filter((d) => statSync(site + d).isDirectory());
  const keys = PROCEDURES.map((p) => p.key);
  for (const k of keys) {
    assert.ok(!KEYS.reserved.includes(k), `${k} is a reserved word`);
    // a procedure's own /<key>/ stub folder is the only top-level folder a key may match
    assert.ok(!folders.includes(k) || readFileSync(`${site}${k}/index.html`, "utf8").includes("This page moved."), `${k} is a top-level folder of site/`);
    assert.ok(!CONDITIONS.some((c) => c.slug === k), `${k} is also a condition slug`);
  }
  for (const c of CONDITIONS) assert.ok(!KEYS.reserved.includes(c.slug), `condition ${c.slug} is a reserved word`);
});

test("conditions and procedures link both ways", () => {
  for (const p of PROCEDURES) for (const s of p.conditions) {
    const c = CONDITIONS.find((x) => x.slug === s);
    assert.ok(c && c.procedures.includes(p.key), `${p.key} -> ${s} is not linked back`);
  }
  for (const c of CONDITIONS) for (const k of c.procedures) assert.ok(PROCEDURES.find((p) => p.key === k)?.conditions.includes(c.slug), `${c.slug} -> ${k} is not linked back`);
});

// Job platform-directory-0036: the "not on the site yet" slugs are stored in doctors' profiles, so they are permanent too.
// The first 38 issued (2026-11-13), held as a count and a hash so the test types no list: they never move or change.
const UPCOMING_BEFORE = { n: 38, sha256: "ddac61e5f1f2575aab9d7dba27f388d49b0ddb5dc6d1b848ff968ff9c3b48d47" };
test("upcoming slugs: append-only like keys, never a key, every one with an item", () => {
  const U = json("upcoming-procedures.json");
  const head = U.issued.slice(0, UPCOMING_BEFORE.n);
  assert.equal(head.length, UPCOMING_BEFORE.n, "an issued slug disappeared");
  assert.equal(createHash("sha256").update(head.join("\n")).digest("hex"), UPCOMING_BEFORE.sha256, "an issued slug moved or changed");
  assert.equal(new Set(U.issued).size, U.issued.length, "an issued slug is listed twice");
  const items = U.groups.flatMap((g) => g.items);
  for (const s of U.issued) assert.ok(items.some((i) => i.slug === s), `${s}: an issued slug with no item`);
  for (const i of items) {
    assert.ok(U.issued.includes(i.slug), `${i.slug}: never issued`);
    assert.ok(!KEYS.issued.includes(i.slug) && !KEYS.reserved.includes(i.slug), `${i.slug}: a key or reserved word`);
  }
});
