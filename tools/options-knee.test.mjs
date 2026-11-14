// The knee every-option page (job platform-main-0020): every number tied through the ledger, deep-only numbers sourced
// and labeled, certainty words the same as the simple page's.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const TOOLS = new URL("./", import.meta.url).pathname;
const run = (mutate) => execFileSync("python3", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(TOOLS)})
import options
c, d, f = options.load("knee-arthritis")
gae = next(x for x in d["detail"] if x["option"] == "embolization")
facts = {x["id"]: x for x in f["fact"]}
${mutate}
try:
    options.check(c, d, f); print("ok")
except options.TieError as e:
    print(e)`]).toString();
test("the knee pages as written are tied", () => assert.equal(run("").trim(), "ok"));
test("a typed number on the deep page fails", () =>
  assert.match(run(`gae["evidence"].append("About 6 out of 10 felt better.[^sir26]")`), /number outside the ledger/));
test("a number in a deep page section fails", () =>
  assert.match(run(`d["section"][0]["text"].append("In 12 trials it failed.[^lanza]")`), /number outside the ledger/));
test("a number in the reading note fails", () =>
  assert.match(run(`d["reading_note"].append("We read 40 papers.")`), /reading note/));
test("a certainty word other than the simple page's fails", () =>
  assert.match(run(`gae["certainty"] = "Strong evidence shows"; gae["works"] = gae["works"].replace("Early results are encouraging", "Strong evidence shows")`), /is not the simple page/));
test("a bottom line that does not open with its certainty word fails", () =>
  assert.match(run(`gae["works"] = "Many people improve. " + gae["works"]`), /must open with its certainty word/));
test("a deep-only fact with no reading label fails", () =>
  assert.match(run(`del facts["bagla"]["read"]`), /read/));
test("a shared fact written as deep-only fails", () =>
  assert.match(run(`gae["works"] = gae["works"] + " {d:gae-skin}"`), /shared fact/));
test("a changed number on the simple page fails", () =>
  assert.match(run(`o = next(o for o in c["options"] if o["id"] == "embolization"); o["side"] = o["side"].replace("1 to 3 out of 10", "2 to 4 out of 10")`), /gae-skin|no ledger line/));
test("abstract-only numbers print their label", () =>
  assert.match(execFileSync("python3", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(TOOLS)})
import options
c, d, f = options.load("knee-arthritis")
print(options._fill("{d:bagla}", {x["id"]: x for x in f["fact"]}))`]).toString(), /\(abstract only\)\[\^bagla22\]/));
