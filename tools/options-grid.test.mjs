// "How well it works" in every deep-page grid (job platform-main-0023; his words 2026-11-07: "the grids, while fine, are
// missing the most important info - how well does it work? For each option"). The column is required for every option,
// carries numbers only through the ledger, and takes its certainty word from the option's detail (tied to the simple page).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const TOOLS = new URL("./", import.meta.url).pathname;
const py = (slug, body) => execFileSync("python3", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(TOOLS)})
import options
c, d, f = options.load(${JSON.stringify(slug)})
g = {x["option"]: x for x in d["glance"]}
${body}`]).toString();
const run = (slug, mutate) => py(slug, `${mutate}
try:
    options.check(c, d, f); print("ok")
except options.TieError as e:
    print(e)`);
for (const slug of ["fibroids", "knee-arthritis", "enlarged-prostate"]) {
  test(`${slug}: grid as written is tied`, () => assert.equal(run(slug, "").trim(), "ok"));
  test(`${slug}: a blank "How well it works" fails`, () =>
    assert.match(run(slug, `g["embolization"]["works"] = ""`), /How well it works" is required/));
  test(`${slug}: a typed number in the column fails`, () =>
    assert.match(run(slug, `g["embolization"]["works"] += "; 9 out of 10 better"`), /number outside the ledger/));
  test(`${slug}: a certainty word typed into the cell fails`, () =>
    assert.match(run(slug, `g["embolization"]["works"] = "Strong evidence shows it works"`), /certainty word comes from/));
  test(`${slug}: the note under the grid is required`, () =>
    assert.match(run(slug, `d["works_note"] = ""`), /works_note/));
  test(`${slug}: the column is first after the name, on the grid and on each option`, () => {
    const out = py(slug, `import re
html = options.render(c, d, f, lambda *a, **k: "", "/x/#finder", "")
heads = re.findall(r"<th scope=col role=columnheader>([^<]+)</th>", html)
print(heads[1], html.count('class="opt-sum"'), len(c["options"]), 'nav class="toc"' in html, sep="|")`).trim();
    const [head, n, total, nav] = out.split("|");
    assert.equal(head, "How well it works"); assert.equal(n, total); assert.equal(nav, "True");
  });
}
test("knee: certainty shows in the cell exactly as on the simple page", () => {
  const out = py("knee-arthritis", `html = options.render(c, d, f, lambda *a, **k: "", "/x/#finder", "")
print('<strong class="cert">Early results are encouraging</strong> <span class="eff">Many people have much less pain for at least a year' in html, "(abstract only)" in html.split("glance-after")[0])`);
  // "(abstract only)" is off on every in-depth page (his yes 2026-11-10 21:29 CT); `read` stays in the facts file
  assert.equal(out.trim(), "True False");
});
