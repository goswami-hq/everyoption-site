// Job 27: public doctor profiles at /doctors/<name-slug>-<npi>/, rendered on request (functions/doctors/[[path]].js and
// tools/dev-server.mjs share this). Who is in: exactly who the finder can show (tools/directory.py writes the static
// records). The live overlay (lib/accounts/listings.mjs overlayFor) lays account changes over them by the finder's rules,
// with the 2-second limit and a 60-second cache; if the database is down the static record is served.
// Public fields only, from an explicit allow-list; every field is escaped in HTML and JSON-LD.
import { overlayFor, withTimeout, zipCenters, TTL, TIMEOUT_MS } from "./accounts/listings.mjs";
import { backendFrom } from "./accounts/backend.mjs";
import { PROCS, PROC_LONG, PROC_SHORT } from "./procedures.mjs";
import { SHELL, INDEX, ORIGIN, PROC_PAGE } from "./directory-shell.mjs";
import { CITIES } from "./cities-data.mjs";
import { publicTelehealth, teleProfile } from "./telehealth.mjs";

const ROUTE = /^\/doctors\/(?:([^/]*)-)?(\d{10})\/?$/i;
const PHOTO = /^\/(photos|api\/photo)\/[0-9]{10}-[0-9a-f]{8,32}\.(jpg|png|webp)$/;
const TEST_NPIS = new Set(["1999999990"]);
const PROD_HOSTS = new Set(["everyoptionmd.com", "www.everyoptionmd.com"]);
const CARD_KEYS = ["insurances", "insurance_other", "insurance_confirm", "booking_url"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ld = (x) => JSON.stringify(x).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const hasPoint = (o) => o && o.city && typeof o.lat === "number" && typeof o.lon === "number";

// Same as tools/directory.py slug() and the copies in site/assets/finder.js and directory.js.
export function slug(name) {
  return String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "doctor";
}
export const profilePath = (name, npi) => `/doctors/${slug(name)}-${npi}/`;

function showPhone(p) {          // as finder.js showPhone
  const m = String(p || "").match(/^\s*(\+?1[\s.\-]*)?\(?(\d{3})\)?[\s.\-]*(\d{3})[\s.\-]*(\d{4})\s*(?:(?:ext\.?|extension|x)\s*(\d+))?\s*(?:\([^)]*\))?\s*$/i);
  return m ? `(${m[2]}) ${m[3]}-${m[4]}${m[5] ? " ext. " + m[5] : ""}` : String(p || "");
}
function telHref(p) {
  const m = String(p || "").match(/^\s*(\+?1[\s.\-]*)?\(?(\d{3})\)?[\s.\-]*(\d{3})[\s.\-]*(\d{4})/);
  if (m) return `tel:+1${m[2]}${m[3]}${m[4]}`;
  const d = String(p || "").replace(/[^0-9+]/g, ""); return d.length >= 10 ? "tel:" + d : "";
}
function safeUrl(u, httpsOnly) {
  try { const x = new URL(u); return (httpsOnly ? x.protocol === "https:" : /^https?:$/.test(x.protocol)) ? x.href : ""; } catch (_) { return ""; }
}

// One doctor: the static record plus the overlay, by finder.js mergeOverlay. Returns null when the finder could show
// them in no group. ov: { ufe: {people, removed}, ... } or null when the database is off or down.
export function mergeDoctor(npi, rec, ov) {
  if (TEST_NPIS.has(npi)) return null;
  const d = rec ? JSON.parse(JSON.stringify(rec)) : null;
  const procs = d ? { ...d.procs } : {};
  let acct = null;
  const blurbs = {};
  for (const proc of PROCS) {
    const o = ov && ov[proc];
    if (!o) continue;
    if ((o.removed || []).includes(npi)) delete procs[proc];
    const c = (o.people || []).find((x) => x.npi === npi);
    if (!c) continue;
    const placed = (rec && rec.procs[proc]) || (c.offices || []).some(hasPoint);
    if (placed) procs[proc] = c.confirmed ? "confirmed" : "likely"; else delete procs[proc];
    acct = acct || c;
    if (placed) blurbs[proc] = c.blurb || "";
  }
  if (!Object.keys(procs).length && !(d && d.roster)) return null;
  const p = d || { name: acct.name, practice: "", city: "", state: "", phone: "", url: "" };
  if (acct) {
    const offs = (acct.offices || []).filter((o) => o && o.city)
      .map(({ practice, street, city, state, zip, phone }) => ({ practice, street, city, state, zip, phone }));
    if (offs.length) Object.assign(p, { practice: offs[0].practice || p.practice, city: offs[0].city, state: offs[0].state,
      phone: offs[0].phone || p.phone, offices: offs }); else delete p.offices;
    for (const k of CARD_KEYS) { const v = acct[k]; if (v && !(Array.isArray(v) && !v.length)) p[k] = v; else delete p[k]; }
    const full = Object.values(procs).includes("confirmed");
    if (full && acct.photo) p.photo = acct.photo; else delete p.photo;
    const tele = full ? publicTelehealth(acct.telehealth) : null;      // job platform-directory-0007: Confirmed only
    if (tele) p.telehealth = tele; else delete p.telehealth;
    p.blurbs = Object.fromEntries(Object.entries({ ...(p.blurbs || {}), ...blurbs }).filter(([k, v]) => v && procs[k]));
  }
  p.procs = procs;
  return p;
}

export const groupOf = (p) => { const v = Object.values(p.procs); return v.includes("confirmed") ? "confirmed" : v.length ? "likely" : "nearby"; };

// Job 42 (his yes, 2026-11-05): a group the setting holds back (nearby, at launch) is indexed again for a doctor who has
// claimed the profile. A doctor whose procedure becomes known moves to Likely or Confirmed, which are indexed.
export const indexedProfile = (p, claimed = false) => !!(INDEX[groupOf(p)] || claimed);

// Job 42 (seo-audit 5): "Name, interventional radiologist, City, ST", no brand.
export const profileTitle = (p) => [p.name, "interventional radiologist", p.city, p.state].filter(Boolean).join(", ");

// Job 42 (city-pages 4): a profile inside a metro circle links back to that metro's city page.
function metroLinks(npi, p) {
  const out = [];
  for (const [k, of] of Object.entries(CITIES.metro_of || {})) {
    const slug = of[npi], m = slug && (CITIES.metros[k] || []).find((x) => x.slug === slug);
    if (m && p.procs[k]) out.push(`<a href="${CITIES.hub[k]}${m.slug}/">Other ${esc(PROC_SHORT[k])} doctors ${esc(m.place)}</a>`);
  }
  return out.length ? `<p class="small metro-link">${out.join('<span class="sep" aria-hidden="true">·</span>')}</p>` : "";
}

export function render(npi, p, { claimed = false } = {}) {
  const path = profilePath(p.name, npi), url = ORIGIN + path, group = groupOf(p);
  const listed = PROCS.filter((k) => p.procs[k]), allConfirmed = listed.length && listed.every((k) => p.procs[k] === "confirmed");
  const where = [p.city, p.state].filter(Boolean).join(", ");
  const procLink = (k) => `<a href="${PROC_PAGE[k]}">${esc(PROC_LONG[k])}</a>`;
  const names = PROCS.map((k) => PROC_SHORT[k]);
  const procItem = (k) => `<li>${procLink(k)}${p.blurbs && p.blurbs[k] ? `<span class="blurb">${esc(p.blurbs[k])}</span>` : ""}</li>`;
  const confirmedNow = listed.filter((k) => p.procs[k] === "confirmed"), likelyNow = listed.filter((k) => p.procs[k] !== "confirmed");
  // His yes 2026-11-03: the qualifier appears once per group, above a plain list, and reads the same on every profile.
  const procHtml = listed.length ? (confirmedNow.length ? `<p class="dir-group"><strong class="confirmed-tag">\u2713 Confirmed by physician:</strong></p><ul class="dir-procs">${confirmedNow.map(procItem).join("")}</ul>` : "")
    + (likelyNow.length ? `<p class="dir-group"><strong>Likely performs:</strong></p><ul class="dir-procs">${likelyNow.map(procItem).join("")}</ul>` : "")
    : `<p>We don't yet know which procedures this doctor performs. Call and ask about:</p><ul class="dir-procs">${PROCS.map((k) => `<li>${procLink(k)}</li>`).join("")}</ul>`;
  const offs = p.offices && p.offices.length ? p.offices : [{ practice: p.practice, city: p.city, state: p.state, phone: p.phone }];
  const offHtml = offs.map((o) => { const t = telHref(o.phone); return `<li>${o.practice ? `<span class="practice">${esc(o.practice)}</span><br>` : ""}${
    esc([o.street, [o.city, o.state].filter(Boolean).join(", ") + (o.zip ? " " + o.zip : "")].filter(Boolean).join(", "))}${
    t && (offs.length > 1 || t !== telHref(p.phone)) ? `<br><a href="${esc(t)}">${esc(showPhone(o.phone))}</a>` : ""}</li>`; }).join("");
  const acts = [], tel = telHref(p.phone), book = p.booking_url ? safeUrl(p.booking_url, true) : "", page = p.url ? safeUrl(p.url) : "";
  if (tel) acts.push(`<a class="call" href="${esc(tel)}">Call ${esc(showPhone(p.phone))}</a>`);
  if (book) acts.push(`<a class="book" href="${esc(book)}" rel="noopener nofollow" target="_blank">Website</a>`);
  if (page) acts.push(`<a class="page" href="${esc(page)}" rel="noopener nofollow" target="_blank">Doctor's page</a>`);
  const ins = [...(p.insurances || []), ...(p.insurance_other ? [p.insurance_other] : [])];
  const q = `?npi=${npi}&name=${encodeURIComponent(p.name)}${listed.length ? "&procedure=" + listed[0] : ""}`;
  // Job platform-directory-0007: video visits under the title line, only while a procedure is Confirmed.
  const tele = group === "confirmed" ? teleProfile(p.telehealth) : "";
  const photo = allConfirmed && PHOTO.test(p.photo || "") ? `<img class="photo" src="${esc(p.photo)}" alt="Photo of ${esc(p.name)}" width="96" height="96">` : "";
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/doctors/">Find a doctor by name</a></li><li><span aria-current="page">${esc(p.name)}</span></li></ol></nav>
<div class="dir-head">${photo}<div><h1>${esc(p.name)}</h1><p class="badge">Interventional radiologist</p>${tele}</div></div>
<h2>Procedures</h2>${procHtml}
<h2>${offs.length > 1 ? `Offices (${offs.length})` : "Office"}</h2><ul class="dir-offices">${offHtml}</ul>
${allConfirmed ? "" : '<p class="confirm-office small muted">Details not confirmed by this doctor. Check with the office before you go.</p>'}
${acts.length ? `<div class="actions">${acts.join("")}</div>` : ""}
${ins.length || p.insurance_confirm ? `<p class="ins"><span class="k">Insurance: </span>${esc(ins.join(", "))}${ins.length && p.insurance_confirm ? ". " : ""}${p.insurance_confirm ? "Confirm with the office." : ""}</p>` : ""}
<p class="claim">${allConfirmed ? "" : `<a href="/account/${esc(q)}">Is this you?</a><span class="sep" aria-hidden="true">·</span>`}<a href="/report/${esc(q)}">Report an error</a></p>
${metroLinks(npi, p)}
<p class="small muted">This page is not a recommendation or a ranking. <a href="/how-we-know/">How we know</a>.</p>`;
  const title = profileTitle(p);
  const conf = listed.filter((k) => p.procs[k] === "confirmed"), lik = listed.filter((k) => p.procs[k] !== "confirmed");
  const desc = `${p.name} is an interventional radiologist${where ? " in " + where : ""}. ` + (listed.length
    ? [conf.length ? `Confirmed by physician: ${conf.map((k) => PROC_SHORT[k]).join(", ")}.` : "", lik.length ? `Likely performs: ${lik.map((k) => PROC_SHORT[k]).join(", ")}.` : ""].filter(Boolean).join(" ")
    : `Office and phone, and how to ask about ${names.join(", ")}.`);
  const person = { "@context": "https://schema.org", "@type": "Person", name: p.name, jobTitle: "Interventional radiologist", url,
    ...(page ? { subjectOf: { "@type": "WebPage", url: page } } : {}),
    // Only what the page states: a procedure appears here only when the doctor confirmed it.
    ...(conf.length ? { knowsAbout: conf.map((k) => ({ "@type": "MedicalProcedure", name: PROC_LONG[k] })) } : {}),
    workLocation: offs.map((o) => ({ "@type": "Place", ...(o.practice ? { name: o.practice } : {}), ...(o.phone ? { telephone: o.phone } : {}),
      address: { "@type": "PostalAddress", ...(o.street ? { streetAddress: o.street } : {}), addressLocality: o.city, addressRegion: o.state,
        ...(o.zip ? { postalCode: o.zip } : {}), addressCountry: "US" } })) };
  const head = `<script type="application/ld+json">${ld(person)}</script>${indexedProfile(p, claimed) ? "" : '\n<meta name="robots" content="noindex">'}`;
  const vals = { HEAD: head, BODY: body, PATH: path, TITLE: esc(title), DESC: esc(desc) };   // one pass: data never meets a placeholder
  return SHELL.replace(/%%(HEAD|BODY|PATH|TITLE|DESC)%%/g, (_, k) => vals[k]);
}

const mem = new Map();          // path -> { at, status, html, location }
const shards = new Map();       // two digits -> records (static, never stale within one deploy)
let rows = null, downUntil = 0;
export function resetDirectory() { mem.clear(); shards.clear(); rows = null; downUntil = 0; }

// Only a good read is kept; an unreadable shard throws (answered 503, never a cached 404) and is tried again next time.
async function shard(assets, npi) {
  const k = npi.slice(-2);
  if (!shards.has(k)) shards.set(k, assets.fetch(new Request(`https://assets.local/data/doctors/${k}.json`))
    .then((r) => { if (!r.ok) throw new Error("shard " + r.status); return r.json(); }));
  try { return (await shards.get(k))[npi] || null; } catch (e) { shards.delete(k); throw e; }
}
async function notFoundPage(assets) {   // Pages serves /404.html at /404 (and redirects the .html address)
  for (const u of ["/404", "/404.html"]) {
    const r = await assets.fetch(new Request("https://assets.local" + u)).catch(() => null);
    if (r && r.ok) return r.text();
  }
  return "<!doctype html><title>Page not found</title><p>Page not found. <a href=\"/doctors/\">Find a doctor by name</a>.</p>";
}
// NPIs whose profile has a current holder account (same test as overlayFor). Server side only: never in a public file.
export const claimedSet = (all) => new Set((all || []).filter((r) => r.account && r.account.npi === r.npi && r.account.level && r.account.level !== "none").map((r) => r.npi));

// All three procedures' overlays from one database read, kept 60 s per isolate so crawling many profiles is one query a minute.
async function overlays(backend, env, now) {
  if (!backend) return { ov: null, failed: false };
  if (rows && now - rows.at < TTL * 1000 && !env.noCache) return { ov: rows.ov, claimed: rows.claimed, failed: false };
  if (now < downUntil) return { ov: null, failed: true };
  try {
    const got = await withTimeout((async () => {
      const all = await backend.data.overlay(), b = { data: { overlay: async () => all } }, zc = zipCenters(env.ASSETS);
      const ov = Object.fromEntries(await Promise.all(PROCS.map(async (k) => [k, await overlayFor(b, k, zc)])));
      return { ov, claimed: claimedSet(all) };
    })(), env.listingsTimeoutMs ?? TIMEOUT_MS);
    rows = { at: now, ...got };
    return { ...got, failed: false };
  } catch (e) {
    downUntil = now + 15000;
    console.error("directory", e && e.message ? e.message.slice(0, 100) : "error");
    return { ov: null, failed: true };
  }
}

// Job 42: the same overlay read for the city pages (one database read a minute serves profiles and city pages alike).
export async function liveOverlay(env = {}, now = Date.now()) {
  const backend = env.backend !== undefined ? env.backend : backendFrom(env);
  return overlays(backend, env, now);
}
export const PROD = PROD_HOSTS;

// site/_headers does not reach Function responses, so its security headers are repeated here.
export const SECURITY = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), interest-cohort=()",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" };
const headers = (host, extra = {}) => ({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${TTL}`, ...SECURITY,
  ...(PROD_HOSTS.has(host) ? {} : { "X-Robots-Tag": "noindex" }), ...extra });

// Returns a Response for a profile address, or null for any other /doctors/ address (the static search and A to Z pages).
export async function handleDoctor(request, env = {}) {
  const url = new URL(request.url), m = ROUTE.exec(url.pathname);
  if (!m) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("", { status: 405, headers: headers(url.hostname, { Allow: "GET, HEAD", "Cache-Control": "no-store" }) });
  const now = (env.now || Date.now)(), npi = m[2];
  const out = (r) => new Response(request.method === "HEAD" ? null : r.html, { status: r.status,
    headers: headers(url.hostname, r.location ? { Location: r.location } : r.status === 503 ? { "Retry-After": "60", "Cache-Control": "no-store" } : {}) });
  const hit = mem.get(url.pathname);
  if (!env.noCache && hit && now - hit.at < TTL * 1000) return out(hit);
  const cache = !env.noCache && typeof caches !== "undefined" ? caches.default : null, ckey = new Request(url.origin + url.pathname);
  const cached = cache && (await cache.match(ckey));
  if (cached) return cached;
  const backend = env.backend !== undefined ? env.backend : backendFrom(env);
  const [rec, { ov, claimed, failed }] = await Promise.all([shard(env.ASSETS, npi).catch(() => undefined), overlays(backend, env, now)]);
  const p = rec === undefined ? null : mergeDoctor(npi, rec, ov);   // shard unreadable: 503 below, never a partial page
  let r;
  if (p) {
    const want = profilePath(p.name, npi);
    r = url.pathname === want ? { status: 200, html: render(npi, p, { claimed: !!(claimed && claimed.has(npi)) }) } : { status: 301, html: "", location: want };
  } else if (rec === undefined || (!rec && failed)) r = { status: 503, html: "<!doctype html><title>Try again</title><p>Please try again in a minute.</p>" };
  else {
    r = { status: 404, html: await notFoundPage(env.ASSETS) };
  }
  if (r.status !== 503 && !env.noCache) mem.set(url.pathname, { at: now, ...r });
  if (mem.size > 500) mem.clear();
  const res = out(r);
  if (cache && r.status !== 503 && request.method === "GET") { const put = cache.put(ckey, res.clone()).catch(() => {}); if (env.waitUntil) env.waitUntil(put); }
  return res;
}
