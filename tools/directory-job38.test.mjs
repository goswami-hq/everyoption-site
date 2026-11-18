// Job 38: no person shows twice under one exact name, city and state. node --test tools/directory-job38.test.mjs
// His words (2026-11-04): "We should also make sure we don't have exact duplicates in our directory".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TOOLS = new URL("./", import.meta.url).pathname;
const py = (code) => JSON.parse(execFileSync("python3", ["-I", "-c",
  `import sys, json; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import directory\n${code}`], { encoding: "utf8" }));

test("the shown directory has no exact name, city and state twice", () => {
  const d = JSON.parse(readFileSync(new URL("../site/data/directory.json", import.meta.url), "utf8")).people;
  const seen = new Map();
  for (const x of d) {
    const k = [x.n, x.c, x.s].join("|");
    assert.ok(!seen.has(k), `${k}: ${seen.get(k)} and ${x.p}`);
    seen.set(k, x.p);
  }
});

test("duplicates(): finds a pair, allows a listed pair, needs every NPI of a group listed", () => {
  const out = py(`recs = {n: {"name": "A B", "city": "C", "state": "S"} for n in ("1", "2", "3")}
recs["4"] = {"name": "A B", "city": "D", "state": "S"}
print(json.dumps([directory.duplicates(recs), directory.duplicates(recs, [["1", "2", "3"]]),
                  directory.duplicates(recs, [["1", "2"]])]))`);
  assert.deepEqual(out[0], [[["A B", "C", "S"], ["1", "2", "3"]]]);
  assert.deepEqual(out[1], []);
  assert.equal(out[2].length, 1);
});

test("the build stops on a duplicate", () => {
  let err = "";
  try {
    execFileSync("python3", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import directory
directory.check_duplicates({"1": {"name": "A", "city": "C", "state": "S"}, "2": {"name": "A", "city": "C", "state": "S"}})`],
      { encoding: "utf8", stdio: "pipe" });
  } catch (e) { err = String(e.stderr); }
  assert.match(err, /shown twice/);
});

test("known-different.json is the short written list", () => {
  const k = JSON.parse(readFileSync(new URL("../content/known-different.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(k.pairs) && k.pairs.length <= 20);
  for (const p of k.pairs) assert.ok(p.npis.length >= 2 && p.why);
});
