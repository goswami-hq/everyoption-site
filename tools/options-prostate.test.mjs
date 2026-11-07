// The prostate every-option page (job platform-main-0019): every number tied through the ledger, deep-only numbers sourced
// and labeled, certainty words the same as the simple page's.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const TOOLS = new URL("./", import.meta.url).pathname;
const run = (mutate) => execFileSync("python3", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(TOOLS)})
import options
c, d, f = options.load("enlarged-prostate")
pae = next(x for x in d["detail"] if x["option"] == "embolization")
facts = {x["id"]: x for x in f["fact"]}
${mutate}
try:
    options.check(c, d, f); print("ok")
except options.TieError as e:
    print(e)`]).toString();
test("the prostate pages as written are tied", () => assert.equal(run("").trim(), "ok"));
test("a typed number on the deep page fails", () =>
  assert.match(run(`pae["evidence"].append("About 8 out of 10 felt better.[^sham]")`), /number outside the ledger/));
test("a number in a deep page section fails", () =>
  assert.match(run(`d["section"][1]["text"].append("In 3 trials it failed.[^ejac]")`), /number outside the ledger/));
test("a number in the reading note fails", () =>
  assert.match(run(`d["reading_note"].append("We read 40 papers.")`), /reading note/));
test("a certainty word other than the simple page's fails", () =>
  assert.match(run(`pae["certainty"] = "Strong evidence shows"; pae["works"] = pae["works"].replace("Early results are encouraging", "Strong evidence shows")`), /is not the simple page/));
test("a bottom line that does not open with its certainty word fails", () =>
  assert.match(run(`pae["works"] = "Many men improve. " + pae["works"]`), /must open with its certainty word/));
test("a deep-only fact with no reading label fails", () =>
  assert.match(run(`del facts["bilhim"]["read"]`), /read/));
test("a changed number on the simple page fails", () =>
  assert.match(run(`o = next(o for o in c["options"] if o["id"] == "embolization"); o["works"] = o["works"].replace("about 1 out of 5", "about 1 out of 4")`), /pae-retreat|no ledger line/));
test("the semen and erection lines are his approved wording (2026-11-06)", () =>
  assert.equal(run(`o = next(o for o in c["options"] if o["id"] == "embolization"); print("Losing ejaculation completely is uncommon, and much less common than after TURP surgery." in o["side"] and "PAE does not seem to affect erections." in o["side"] and "Most men keep normal ejaculation. Some notice less semen." in o["side"])`).trim().split("\n")[0], "True"));
test("abstract-only numbers print their label", () =>
  assert.match(execFileSync("python3", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(TOOLS)})
import options
c, d, f = options.load("enlarged-prostate")
print(options._fill("{d:bilhim}", {x["id"]: x for x in f["fact"]}))`]).toString(), /\(abstract only\)\[\^bilhim\]/));
