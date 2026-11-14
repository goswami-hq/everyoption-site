// W32 (ai-hq job platform-launch-0005, his go 2026-11-13 18:58 CT): every page, static or rendered by a Function, carries
// the footer's three legal links and the owner disclosure, and loads the notice bar; the finder line sits under every
// "Find doctors" button; notice.js shows the bar on a first visit and not after OK; the legal pages hold their texts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import vm from "node:vm";
import { handleCity, resetCities } from "../lib/cities.mjs";
import { handleDoctor, resetDirectory } from "../lib/directory.mjs";
import { CITIES } from "../lib/cities-data.mjs";
import { PROCS } from "../lib/procedures.mjs";

const SITE = new URL("../site/", import.meta.url);
const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, SITE), "utf8");
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const DISCLOSURE = "Every Option is run by a practicing interventional radiologist. Listings are free, and no one can pay to be listed, ranked higher, or sent patients.";
const LINKS = ['<a href="/terms/">Terms of use</a>', '<a href="/privacy/">Privacy</a>', '<a href="/physician-terms/">Physician terms</a>'];
const FINDER_LINE = 'By searching you agree to our <a href="/terms/">Terms</a>.';

function footerErrors(tag, html) {
  const errs = [];
  const foot = html.match(/<footer class="site">[\s\S]*?<\/footer>/);
  if (!foot) return [`${tag}: no footer`];
  for (const l of LINKS) if (!foot[0].includes(l)) errs.push(`${tag}: footer lacks ${l}`);
  if (!foot[0].includes(DISCLOSURE)) errs.push(`${tag}: footer lacks the disclosure line`);
  if (!foot[0].includes("Education, not medical advice.")) errs.push(`${tag}: footer lacks "Education, not medical advice."`);
  if (!/<script src="\/assets\/notice\.js\?v=[0-9a-f]{10}" defer><\/script>/.test(html)) errs.push(`${tag}: notice.js not loaded with defer`);
  const buttons = (html.match(/Find doctors<\/button>/g) || []).length, lines = html.split(FINDER_LINE).length - 1;
  if (buttons !== lines) errs.push(`${tag}: ${buttons} "Find doctors" buttons, ${lines} terms lines`);
  return errs;
}

function pages(dir = SITE, out = []) {
  for (const name of readdirSync(dir)) {
    const u = new URL(name, dir);
    if (statSync(u).isDirectory()) pages(new URL(name + "/", dir), out);
    else if (name.endsWith(".html")) out.push(u);
  }
  return out;
}

test("every static page: three legal links, the disclosure, notice.js, a terms line under each Find doctors button", () => {
  const all = pages();
  assert.ok(all.length >= 50, `only ${all.length} pages`);
  const errs = all.flatMap((u) => footerErrors(u.pathname.slice(SITE.pathname.length), readFileSync(u, "utf8")));
  assert.deepEqual(errs, []);
  for (const p of ["index.html", "fibroids/index.html", "fibroids/every-option/index.html"])
    assert.ok(read(p).includes(FINDER_LINE), `${p}: no finder terms line`);
});

test("Function-rendered pages: sampled city pages and profiles carry the same footer", async () => {
  let n = 0;
  for (const k of PROCS) {
    for (const m of (CITIES.metros[k] || []).slice(0, 2)) {
      resetCities(); resetDirectory();
      const r = await handleCity(new Request(`http://localhost:8787${CITIES.hub[k]}${m.slug}/`), { backend: null, noCache: true, ASSETS });
      assert.equal(r.status, 200, m.slug);
      assert.deepEqual(footerErrors(`${k} ${m.slug}`, await r.text()), []);
      n++;
    }
  }
  const dir = JSON.parse(read("data/directory.json")).people;
  for (const d of dir.filter((_, i) => i % Math.floor(dir.length / 6) === 0).slice(0, 6)) {
    resetDirectory();
    const r = await handleDoctor(new Request(`http://localhost:8787${d.p}`), { backend: null, noCache: true, ASSETS });
    assert.equal(r.status, 200, d.p);
    assert.deepEqual(footerErrors(d.p, await r.text()), []);
    n++;
  }
  assert.ok(n >= 10, `sampled ${n}`);
});

test("legal pages: H1, Effective line, and every paragraph of the text in order, nothing added", () => {
  const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  for (const [path, file] of [["terms", "terms.md"], ["privacy", "privacy.md"], ["physician-terms", "physician-terms.md"]]) {
    const html = read(`${path}/index.html`);
    const md = readFileSync(new URL(`content/legal/${file}`, ROOT), "utf8").trim().split(/\n\s*\n/)
      .map((b) => b.replace(/^#+ /, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim());
    const main = html.match(/<div class="prose legal">([\s\S]*?)<\/div>/)[1];
    const blocks = [...main.matchAll(/<(h1|h2|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => strip(m[2]));
    assert.equal(blocks[0], md[0], `${path}: H1`);
    assert.equal(blocks[1], "Effective November 13, 2026", `${path}: Effective line`);
    assert.deepEqual(blocks.slice(2), md.slice(1), `${path}: body differs from content/legal/${file}`);
    assert.match(html, /<link rel="canonical" href="https:\/\/everyoptionmd\.com\/[a-z-]+\/">/);
    assert.ok(read("sitemap-pages.xml").includes(`https://everyoptionmd.com/${path}/`), `${path} not in the page sitemap`);
  }
});

// A small stand-in for the browser: enough DOM for notice.js.
function browser(storage) {
  const make = (tag) => {
    const n = { tagName: tag.toUpperCase(), children: [], attrs: {}, listeners: {}, className: "", textContent: "", parentNode: null, offsetHeight: 64,
      appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
      removeChild(c) { n.children = n.children.filter((x) => x !== c); c.parentNode = null; return c; },
      setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return n.attrs[k]; },
      addEventListener(t, f) { (n.listeners[t] ||= []).push(f); },
      click() { (n.listeners.click || []).forEach((f) => f({})); } };
    return n;
  };
  const classes = new Set(), props = {};
  const root = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } } };
  const body = make("body");
  const document = { documentElement: root, body, createElement: make,
    createTextNode: (t) => ({ tagName: "#text", textContent: t, children: [] }), addEventListener() {} };
  const win = { document, localStorage: storage, addEventListener() {}, removeEventListener() {} };
  win.window = win;
  return { win, body, classes, props };
}
const text = (n) => n.tagName === "#text" ? n.textContent : (n.textContent || "") + n.children.map(text).join("");
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const NOTICE = readFileSync(new URL("assets/notice.js", SITE), "utf8");
const run = (b) => vm.runInNewContext(NOTICE, b.win);

test("notice.js: shows the bar on a first visit, remembers OK with the date, and is gone after OK", () => {
  const store = memory();
  const b = browser(store);
  run(b);
  assert.equal(b.body.children.length, 1, "no bar on first visit");
  const bar = b.body.children[0];
  assert.equal(bar.attrs.role, "region"); assert.equal(bar.attrs["aria-label"], "Site notice");
  assert.equal(text(bar.children[0]), "Education only, not medical advice. By using this site you agree to our Terms.");
  const link = bar.children[0].children.find((c) => c.tagName === "A");
  assert.equal(link.href, "/terms/"); assert.equal(link.textContent, "Terms");
  const ok = bar.children[1];
  assert.equal(ok.tagName, "BUTTON"); assert.equal(ok.type, "button"); assert.equal(ok.textContent, "OK");
  assert.ok(b.classes.has("eo-notice-on")); assert.equal(b.props["--notice-h"], "64px");
  ok.click();
  assert.equal(b.body.children.length, 0, "bar still there after OK");
  assert.ok(!b.classes.has("eo-notice-on")); assert.equal(b.props["--notice-h"], undefined);
  assert.match(store.m.get("eo-notice-ok"), /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([...store.m.keys()], ["eo-notice-ok"], "only the one key is stored");
  const again = browser(store);
  run(again);
  assert.equal(again.body.children.length, 0, "bar shown again after OK");
});

test("notice.js: blocked storage shows the bar again and OK still closes it; no cookie, no network", () => {
  const blocked = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
  for (let i = 0; i < 2; i++) {
    const b = browser(blocked);
    run(b);
    assert.equal(b.body.children.length, 1, "bar not shown with blocked storage");
    b.body.children[0].children[1].click();
    assert.equal(b.body.children.length, 0);
  }
  assert.doesNotMatch(NOTICE, /document\.cookie|fetch\(|XMLHttpRequest|sendBeacon|new Image/);
});
