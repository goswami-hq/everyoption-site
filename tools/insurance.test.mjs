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

// Job platform-condition-pages-0013 (his words 2026-11-08 21:35 CT): live pages link here, placed from patient walkthroughs.
// The links must keep the coverage page's own H1 as their text, and the pelvic pages must not link: they have no coverage data.
test("the coverage links land where the walkthroughs put them, with the target page's words", () => {
  // job platform-directory-0032: the procedures declaring a coverage page are the ones content/insurance/pages.toml builds
  const procs = JSON.parse(readFileSync(new URL("../content/procedures.json", import.meta.url), "utf8"));
  const COV = procs.filter((p) => p.parts && p.parts.coverage).map((p) => ({ key: p.key, coverage: p.parts.coverage }));
  const toml = readFileSync(new URL("../content/insurance/pages.toml", import.meta.url), "utf8");
  assert.deepEqual(COV.map((p) => p.coverage.path), [...toml.matchAll(/^slug = "([^"]+)"/gm)].map((m) => `/${m[1]}/insurance/`));
  assert.ok(COV.length > 0);
  for (const p of COV) {
    const page = read(p.coverage.path.slice(1, -1));
    const h1 = page.match(/<h1[^>]*>([^<]+)<\/h1>/)[1].replace(/&#x27;/g, "'");
    assert.equal(p.coverage.link, h1, `${p.key}: link text matches the page's H1`);
    const slug = p.coverage.path.split("/")[1];
    const link = `<p class="cov-link"><a href="${p.coverage.path}">${h1}</a></p>`;
    assert.ok(read(slug).includes(link), `${slug}: under the lead option's button`);
    const deep = read(`${slug}/every-option`);
    assert.ok(deep.includes(link), `${slug} every-option: under the lead option's button`);
    assert.ok(deep.includes(`<li class="toc-out"><a href="${p.coverage.path}">${h1}</a></li>`), `${slug} every-option: contents list`);
  }
  assert.ok(read("").includes('<p class="cov-link home-cov"><a href="/insurance/">Will insurance cover it?</a></p>'), "home line");
  for (const p of ["", "fibroids", "doctors", "how-we-know"]) {
    assert.match(read(p).split('<footer class="site">')[1], /<a href="\/insurance\/">Insurance coverage<\/a>/, `${p}: footer`);
    assert.match(read(p).split("</header>")[0], /<a href="\/insurance\/">Insurance<\/a>/, `${p}: menu`);
  }
  for (const f of htmlFiles(path.join(SITE, "chronic-pelvic-pain"))) {
    assert.doesNotMatch(readFileSync(f, "utf8").split('<footer class="site">')[0].replace(/<header.*?<\/header>/s, ""), /href="\/(?:[a-z-]+\/)?insurance\//, f);
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

test("the hub folds only its HAE cards: 12 folds, the script loads, the dataset grid stays open", () => {   // his "Yes", 2026-11-08 12:00 CT
  const t = read("insurance");
  assert.equal((t.match(/<details class="ins-more">/g) || []).length, 12);
  assert.match(t, /insurance\.js/);
  const grid = t.slice(t.indexOf('id="dataset"'), t.indexOf('id="hae"'));
  assert.doesNotMatch(grid, /<details/);
  for (const k of ["hae-uhc-ma", "hae-anthem", "hae-aetna", "hae-molina"]) {
    const card = t.slice(t.indexOf(`id="${k}"`), t.indexOf("</article>", t.indexOf(`id="${k}"`)));
    assert.match(card, /<span class="ins-lead">[^<]*\.\s+\S/, `${k}: whole text in the summary`);
  }
});

test("the source file is present",() => assert.ok(existsSync(new URL("../content/insurance/coverage-2026-11.toml", import.meta.url))));

test("the sources list is folded at every width, every source number points inside it, and the script opens it", () => {   // his "Collapse sources for sure", 2026-11-08
  for (const p of PAGES.slice(0, 3)) {
    const h = read(p);
    const fold = h.match(/<details class="ins-sources"><summary><h2 id="sources">Sources \((\d+)\)<\/h2><\/summary><ol class="refs">([\s\S]*?)<\/ol><\/details>/);
    assert.ok(fold, `${p}: sources folded in a closed details with a counted heading`);
    const items = (fold[2].match(/<li id="ref-\d+">/g) || []).length;
    assert.equal(items, Number(fold[1]), `${p}: count matches the list`);
    for (const m of h.matchAll(/href="#ref-(\d+)"/g)) assert.ok(fold[2].includes(`id="ref-${m[1]}"`), `${p}: ref-${m[1]} is inside the fold`);
  }
  const js = readFileSync(path.join(SITE, "assets", "insurance.js"), "utf8");
  assert.match(js, /tagName === "DETAILS"\) p\.open = true/);
});

test("the hub grid: every insurer has four rows in order, each with its full name, status, policy link and own date, plus one phone date line", () => {   // his "Yes", 2026-11-08 12:06 CT
  const t = read("insurance");
  const grid = t.slice(t.indexOf('class="ins-hub"'), t.indexOf('id="hae"'));
  const cards = grid.split('<section class="card ins-hub-card">').slice(1);
  assert.equal(cards.length, 12);
  for (const c of cards) {
    const rows = c.split('<div class="ins-row">').slice(1);
    assert.deepEqual(rows.map((r) => r.match(/>([A-Z]{3})<span class="ins-proc-rest">/)[1]), ["UFE", "PAE", "GAE", "HAE"]);
    for (const [r, full] of rows.map((r, n) => [r, ["Fibroids (UFE)", "Enlarged prostate (PAE)", "Knee arthritis (GAE)", "Hemorrhoids (HAE)"][n]])) {
      assert.equal(r.split("</a>")[0].replace(/<[^>]+>/g, ""), full, "full name in the link for screen readers");
      assert.match(r, /class="ins-chip ins-[a-z_]+"><svg/, "status has a shape");
      assert.ok(CHIPS.includes(r.match(/<\/svg>([^<]+)<\/span>/)[1]), "status in words");
      assert.match(r, /<a href="https:[^"]+" rel="noopener" aria-label="[^"]+">Policy( list)?<\/a>/, "policy link");
      assert.match(r, /<span class="ins-row-date(?: ins-row-date-keep)?"><span class="ins-sep"> · <\/span>(?:Checked|Looked) [A-Z][a-z]+ \d{1,2}, 2026<\/span>/, "its own date");
    }
    const notChecked = rows.filter((r) => r.includes("ins-not_checked"));
    for (const r of notChecked) assert.match(r, /class="ins-row-date ins-row-date-keep"><span class="ins-sep"> · <\/span>Looked /, "a Not yet checked row keeps its date, worded Looked");
    const line = c.match(/<p class="ins-meta ins-hub-checked">([^<]+)<\/p>/);
    if (notChecked.length === 4) { assert.equal(line, null, "no lone Checked line under four Not yet checked rows"); continue; }
    const dates = rows.filter((r) => !r.includes("ins-not_checked")).map((r) => r.match(/ins-row-date"><span class="ins-sep"> · <\/span>Checked ([^<]+)</)[1]);
    if (new Set(dates).size === 1) assert.equal(line[1], `Checked ${dates[0]}`, "one date line stands for all the dates when they agree");
    else for (const d of dates) assert.ok(line[1].includes(d), "differing dates are each kept");
  }
});

test("each hub row links to that insurer's card for that procedure", () => {
  const t = read("insurance");
  const grid = t.slice(t.indexOf('class="ins-hub"'), t.indexOf('id="hae"'));
  for (const c of grid.split('<section class="card ins-hub-card">').slice(1)) {
    const hrefs = [...c.matchAll(/<dt><a href="([^"]+)"/g)].map((m) => m[1]);
    const i = hrefs[0].split("#ufe-")[1];
    assert.deepEqual(hrefs, [`/fibroids/insurance/#ufe-${i}`, `/enlarged-prostate/insurance/#pae-${i}`, `/knee-arthritis/insurance/#gae-${i}`, `#hae-${i}`]);
  }
});
