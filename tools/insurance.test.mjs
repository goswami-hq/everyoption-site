// The insurance pages (job platform-condition-pages-0005; his rules, 2026-11-08): not public until launch, every card dated
// and linked, words and a shape on every label, the required lines present, no pelvic or Medicaid data.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SITE = new URL("../site/", import.meta.url).pathname;
const PAGES = ["fibroids/insurance", "enlarged-prostate/insurance", "knee-arthritis/insurance", "insurance"];
const read = (p) => readFileSync(path.join(SITE, p, "index.html"), "utf8");
const PLAN = "Your plan may differ. Employer self-funded plans and Medicare Advantage plans can set their own rules. Check with your plan.";
const CHIPS = ["Covered with conditions", "Covered", "Not covered", "No specific policy", "Decided case by case", "Not yet checked"];

function htmlFiles(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) htmlFiles(f, out);
    else if (n.endsWith(".html")) out.push(f);
  }
  return out;
}

test("the new pages are noindex and out of every sitemap", () => {
  for (const p of PAGES) {
    assert.match(read(p), /<meta name="robots" content="noindex">/, p);
  }
  for (const n of readdirSync(SITE).filter((f) => f.startsWith("sitemap") && f.endsWith(".xml"))) {
    assert.doesNotMatch(readFileSync(path.join(SITE, n), "utf8"), /insurance/, n);
  }
});

test("no page outside the insurance set links to them", () => {
  const own = PAGES.map((p) => path.join(SITE, p, "index.html"));
  for (const f of htmlFiles(SITE)) {
    if (own.includes(f)) continue;
    assert.doesNotMatch(readFileSync(f, "utf8"), /href="\/(?:[a-z-]+\/)?insurance\//, f);
  }
});

test("every procedure page has 12 cards in the fixed order, each with a chip, a date, and a link", () => {
  const order = ["medicare", "uhc", "uhc-ma", "anthem", "aetna", "aetna-ma", "cigna", "humana", "hcsc", "ambetter", "molina", "kaiser"];
  for (const [p, key] of [["fibroids/insurance", "ufe"], ["enlarged-prostate/insurance", "pae"], ["knee-arthritis/insurance", "gae"]]) {
    const t = read(p);
    const ids = [...t.matchAll(new RegExp(`<article class="card ins-card" id="${key}-([a-z-]+)"`, "g"))].map((m) => m[1]);
    assert.deepEqual(ids, order, p);
    for (const c of t.split('<article class="card ins-card"').slice(1)) {
      const card = c.split("</article>")[0];
      assert.match(card, /class="ins-chip ins-[a-z_]+"><svg/, "chip with a shape");
      assert.match(card, /Checked [A-Z][a-z]+ \d{1,2}, 2026/, "date checked");
      assert.match(card, /<p class="ins-meta">.*<a href="https:/, "policy link");
      const label = card.match(/<\/svg>([^<]+)<\/span>/)[1];
      assert.ok(CHIPS.includes(label), label);
    }
  }
});

test("a bare Covered chip appears only on the Aetna PAE card", () => {
  for (const p of PAGES) {
    const n = [...read(p).matchAll(/ins-chip ins-covered"/g)].length;
    assert.ok(n <= (p.includes("prostate") ? 2 : p === "insurance" ? 2 : 0), `${p}: ${n}`);
  }
  const card = read("enlarged-prostate/insurance").split('id="pae-aetna"')[1].split("</article>")[0];
  assert.match(card, /no further conditions/);
});

test("required lines, sections, and data limits", () => {
  for (const p of PAGES) {
    const t = read(p);
    assert.ok(t.includes(PLAN), `${p}: header line`);
    assert.match(t, /Education, not medical advice/, p);
    assert.match(t, /Page last reviewed/, p);
    assert.doesNotMatch(t, /pelvic vein|ovarian vein|Medicaid plan/i, p);
  }
  for (const p of PAGES.slice(0, 3)) assert.match(read(p), /What if my insurer says no\?/, p);
  assert.doesNotMatch(read("fibroids/insurance") + read("enlarged-prostate/insurance") + read("knee-arthritis/insurance"), /id="hae-/);
});

test("the hub carries Dataset data, method, next check, and both dated changes", () => {
  const t = read("insurance");
  const ld = [...t.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.ok(ld.some((x) => x["@type"] === "Dataset"));
  assert.match(t, /December 1, 2026/);
  assert.match(t, /November 15, 2026/);
  assert.match(t, /Next check:/);
  assert.match(t, /id="hae-medicare"/);
  for (const c of ["/fibroids/insurance/", "/enlarged-prostate/insurance/", "/knee-arthritis/insurance/"]) assert.ok(t.includes(`href="${c}"`), c);
});

// Phone-length job platform-condition-pages-0008 (his "Yes", 2026-11-08 11:15 CT).
const COVERAGE = [["fibroids/insurance", "ufe"], ["enlarged-prostate/insurance", "pae"], ["knee-arthritis/insurance", "gae"]];

test("the jump list comes before the cards, in their order, with plain links and the says-no link", () => {
  for (const [p, key] of COVERAGE) {
    const t = read(p);
    const nav = t.split('<nav class="ins-jump"')[1].split("</nav>")[0];
    const jumps = [...nav.matchAll(/<li><a href="#([a-z-]+)">/g)].map((m) => m[1]);
    const cards = [...t.matchAll(new RegExp(`<article class="card ins-card" id="(${key}-[a-z-]+)"`, "g"))].map((m) => m[1]);
    assert.deepEqual(jumps, cards, p);
    assert.match(nav, /<a href="#if-no">What if my insurer says no\?<\/a>/, p);
    assert.ok(t.indexOf('class="ins-jump"') < t.indexOf('id="by-insurer"'), p);
    assert.match(t, /<h2 id="if-no">/, p);
  }
});

test("card details are native, closed in the HTML, with chip and first line in the summary and all text in the page", () => {
  for (const [p] of COVERAGE) {
    const t = read(p);
    for (const c of t.split('<article class="card ins-card"').slice(1)) {
      const card = c.split("</article>")[0];
      assert.match(card, /<details class="ins-more"><summary><span class="ins-chip [^"]+"><svg/, "chip in the summary");
      assert.match(card, /<span class="ins-lead">[^<]+<\/span><\/summary>/, "one line in the summary");
      assert.match(card.split("</summary>")[1], /Checked [A-Z][a-z]+ \d{1,2}, 2026/, "date in the details");
    }
    assert.doesNotMatch(t, /<details class="ins-more" open/, p);
    assert.match(t, /<script src="\/assets\/insurance\.js[^"]*" defer><\/script>/, p);
  }
});

test("what decides coverage or hedges a firm line stays visible with the details closed", () => {
  const visible = (p, id) => read(p).split(`id="${id}"`)[1].split("</summary>")[0];
  for (const id of ["ufe-uhc", "ufe-uhc-ma"]) assert.match(visible("fibroids/insurance", id), /Not covered when the purpose is to preserve the ability to have children\./, id);
  const humana = visible("fibroids/insurance", "ufe-humana");
  assert.match(humana, /wants to keep the uterus/);
  assert.match(humana, /3 months or more/);
  assert.match(visible("knee-arthritis/insurance", "gae-anthem"), /appear to use/);
  assert.match(visible("enlarged-prostate/insurance", "pae-kaiser"), /only inside an approved device study/);
  assert.match(visible("knee-arthritis/insurance", "gae-molina"), /Medicare decision overrides this policy/);
});

test("the hub is not folded", () => {
  const t = read("insurance");
  assert.doesNotMatch(t, /ins-more|ins-jump|insurance\.js/);
});

test("the source file is present",() => assert.ok(existsSync(new URL("../content/insurance/coverage-2026-11.toml", import.meta.url))));
