// Patient walkthrough fixes 1 to 4 (his words, 2026-11-09: "1-4 changes let's do them"). Reads the built pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (p) => readFileSync(new URL(`../site/${p}index.html`, import.meta.url), "utf8");
const WITH = { "fibroids/": "/fibroids/every-option/", "enlarged-prostate/": "/enlarged-prostate/every-option/", "knee-arthritis/": "/knee-arthritis/every-option/" };

test("first-screen compare link on the three conditions with a comparison page, and none on pelvic", () => {
  for (const [p, to] of Object.entries(WITH)) {
    const html = page(p);
    assert.match(html, new RegExp(`<p class="find-links"><a href="#[a-z-]+">How it works</a><a class="find-compare" href="${to}">Compare your options</a></p>`), p);
    assert.ok(html.indexOf('class="find-compare"') < html.indexOf('id="zip-form"'), `${p}: link comes before the finder`);
  }
  const pelvic = page("chronic-pelvic-pain/");
  assert.match(pelvic, /<p class="find-links"><a href="#embolization">How it works<\/a><\/p>/);
  assert.doesNotMatch(pelvic, /find-compare/);
});

test("comparison page opens with the at-a-glance view, then the finder button, then the lede", () => {
  for (const p of Object.values(WITH)) {
    const html = page(p.slice(1));
    const h1 = html.indexOf("<h1>"), peek = html.indexOf('class="glance-peek"'), cta = html.indexOf('<p class="cta">', peek), lede = html.indexOf('class="lede"');
    assert.ok(h1 >= 0 && h1 < peek && peek < cta && cta < lede, `${p}: order ${[h1, peek, cta, lede]}`);
    // his 5B, 2026-11-09 21:42 CT: the caption states the slice, the link the full count
    const m = html.slice(peek).match(/<caption>At a glance: (\d+) of (\d+) treatments<\/caption>/);
    assert.ok(m, `${p}: caption`);
    assert.match(html.slice(peek), new RegExp(`<a href="#glance">See all ${m[2]} and how well each works</a>`));
  }
});

test("peek cells carry the grid's own text", () => {
  for (const p of Object.values(WITH)) {
    const html = page(p.slice(1)), start = html.indexOf('class="glance-peek"');
    const peek = html.slice(start, html.indexOf("</table>", start)), grid = html.slice(html.indexOf('class="glance"'));
    for (const m of peek.matchAll(/<td data-label="([^"]+)">(.*?)<\/td>/g)) {
      const found = m[1] === "What the evidence says" ? grid.includes(m[2]) : grid.includes(`data-label="${m[1]}">${m[2]}</td>`);
      assert.ok(found, `${p}: "${m[2]}" (${m[1]}) is not in the full grid`);
    }
    assert.match(peek, /What the evidence says/, `${p}: the view states how sure the evidence is`);
  }
});

test("Conditions in the menu: marked from a condition's short page, plain elsewhere", () => {
  for (const p of [...Object.keys(WITH), "chronic-pelvic-pain/"]) {
    assert.ok(page(p).includes(`<a href="/?from=${p.slice(0, -1)}#conditions">Conditions</a>`), p);
  }
  assert.ok(page("").includes('<a href="/#conditions">Conditions</a>'), "home keeps its own link");
  assert.ok(page("fibroids/every-option/").includes('<a href="/#conditions">Conditions</a>'), "the comparison page is not the card's target");
});

test("home: each condition with a comparison page gives its card the address; the page loads the script; banner sits in a landmark", () => {
  const home = page("");
  for (const [p, to] of Object.entries(WITH)) assert.ok(home.includes(`href="/${p}" data-compare='${to}'`) || home.includes(`href="/${p}" data-compare="${to}"`), p);
  assert.doesNotMatch(home, /href="\/chronic-pelvic-pain\/" data-compare/);
  assert.match(home, /src="\/assets\/home-from\.js/);
  assert.match(home, /<section class="home-top" aria-label="Introduction"><div class="home-banner/);
});
