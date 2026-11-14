// The city-page half of the condition pattern (docs/condition-pattern.md; tools/pattern.py checks the simple and
// every-option pages at build time). Job platform-main-0016. node --test tools/condition-pattern.test.mjs
// For every procedure with city pages: the hub has BreadcrumbList; each city page has BreadcrumbList and ItemList, links
// to its condition's simple page, and, when that condition has an every-option page, links to it with descriptive text.
// A condition without city pages or without an every-option page is skipped for that part.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { handleCity, resetCities } from "../lib/cities.mjs";
import { resetDirectory } from "../lib/directory.mjs";
import { CITIES } from "../lib/cities-data.mjs";

const SITE = new URL("../site/", import.meta.url);
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); }
} };
const get = async (path) => {
  resetCities(); resetDirectory();
  const r = await handleCity(new Request(`http://localhost:8787${path}`), { backend: null, noCache: true, ASSETS });
  return { status: r.status, html: await r.text() };
};
const types = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])["@type"]);
const link = (html, href) => new RegExp(`<a href="${href.replace(/[/.]/g, "\\$&")}">([^<]{12,})</a>`).exec(html);

for (const [proc, metros] of Object.entries(CITIES.metros)) {
  if (!metros.length) continue;
  const hub = CITIES.hub[proc];
  const simple = hub.replace(/doctors\/$/, "");
  const deep = `${simple}every-option/`;
  const hasDeep = existsSync(new URL(`.${deep}index.html`, SITE));
  test(`${proc}: city hub has BreadcrumbList and links every city page`, async () => {
    const { status, html } = await get(hub);
    assert.equal(status, 200);
    assert.ok(types(html).includes("BreadcrumbList"));
    assert.ok(!types(html).includes("FAQPage"));
    for (const m of metros) assert.ok(html.includes(`href="${hub}${m.slug}/"`), m.slug);
  });
  test(`${proc}: each city page has BreadcrumbList and ItemList, and links the simple${hasDeep ? " and every-option" : ""} page`, async () => {
    for (const m of metros) {
      const { status, html } = await get(`${hub}${m.slug}/`);
      assert.equal(status, 200, m.slug);
      const t = types(html);
      assert.ok(t.includes("BreadcrumbList") && t.includes("ItemList") && !t.includes("FAQPage"), `${m.slug}: ${t}`);
      assert.ok(link(html, simple), `${m.slug}: no descriptive link to ${simple}`);
      if (hasDeep) assert.ok(link(html, deep), `${m.slug}: no descriptive link to ${deep}`);
      assert.match(html, /Page last reviewed/);
    }
  });
}
