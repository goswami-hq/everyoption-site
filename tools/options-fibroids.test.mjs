// The simple and deep fibroid pages stay tied in numbers, sources and relative phrasing (his words, 2026-11-05).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const TOOLS = new URL("./", import.meta.url).pathname;
const run = (mutate) => execFileSync("python3", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(TOOLS)})
import options
c, d, f = options.load("fibroids")
emb = next(o for o in c["options"] if o["id"] == "embolization")
det = next(x for x in d["detail"] if x["option"] == "embolization")
${mutate}
try:
    options.check(c, d, f); print("ok")
except options.TieError as e:
    print(e)`]).toString();
test("the pages as written are tied", () => assert.equal(run("").trim(), "ok"));
test("a changed number on the simple page fails", () =>
  assert.match(run(`emb["works"] = emb["works"].replace("Almost 9 out of 10", "Almost 8 out of 10")`), /ufe-improve|no ledger line/));
test("a new number on the simple page fails until it is in the ledger", () =>
  assert.match(run(`emb["side"] += " About 3 out of 10 feel sick."`), /no ledger line/));
test("a typed number on the deep page fails", () =>
  assert.match(run(`det["works"] += " About 6 out of 10 are happy.[^sir]"`), /number outside the ledger/));
test("a dropped citation on the simple page fails", () =>
  assert.match(run(`emb["works"] = emb["works"].replace("[^iqwig]", "")`), /no longer cites/));
test("a source the simple page does not have fails", () =>
  assert.match(run(`det["risks"] += " Rare.[^nope]"`), /not on the simple page/));
test("a changed comparison on the simple page fails", () =>
  assert.match(run(`emb["works"] = emb["works"].replace("just as satisfied as those", "more satisfied than those")`), /ufe-satisfied/));
