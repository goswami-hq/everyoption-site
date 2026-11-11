// Job 42: procedure-by-city pages, rendered on request (his words, 2026-11-05: "We want the pages to automatically
// update with the doctors nearby and their details though, so it shouldn't be a static page, it should dynamically
// update"). Spec: goswami-hq/ai-hq projects/platform/aeo/skills-run-2026-11-05/city-pages.md.
//   /fibroids/doctors/               hub: every metro page and every state, with live counts
//   /fibroids/doctors/<metro-slug>/  one metro: every listed doctor within 25 miles of its fixed center ZIP(s)
// The static list (site/data/<proc>.json) with the live account overlay laid on top by the finder's own rules
// (site/assets/finder.js mergeOverlay, place, the sort in run): Confirmed first, then Likely, each nearest first, name
// breaking ties; a doctor who removed the procedure leaves. Same 2-second limit and 60-second cache as profiles; if the
// database is down the static list is served. Cards, counts and links are all in the HTML: no script is needed.
import { CITY_SHELL, CITIES } from "./cities-data.mjs";
import { liveOverlay, profilePath, profileHref, SECURITY, PROD } from "./directory.mjs";
import { TTL } from "./accounts/listings.mjs";
import { PROC_LONG, PROC_SHORT, COVERAGE } from "./procedures.mjs";
import { publicTelehealth, teleBadge } from "./telehealth.mjs";

const ORIGIN = "https://everyoptionmd.com";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ld = (x) => JSON.stringify(x).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const PATIENT = { ufe: "fibroid embolization", pae: "prostate artery embolization", gae: "knee artery embolization", pelvic: "pelvic vein treatment", hae: "hemorrhoid embolization" };          // the patient's words for the question title
const CONDITION = { ufe: "fibroid", pae: "enlarged prostate", gae: "knee arthritis", pelvic: "chronic pelvic pain", hae: "bleeding hemorrhoids" };
// The condition page's label in breadcrumbs: the same word the home card uses (a plural "s" on CONDITION does not extend:
// "enlarged prostates").
const CONDITION_LABEL = { ufe: "Fibroids", pae: "Enlarged prostate", gae: "Knee arthritis", pelvic: "Chronic pelvic pain", hae: "Bleeding hemorrhoids" };
// The hub's name in breadcrumbs (S3, job platform-main-0024): the procedure, as the every-option page's city link names it.
const HUB_LABEL = { ufe: "Fibroid embolization doctors", pae: "Prostate artery embolization doctors", gae: "Knee embolization doctors", pelvic: "Pelvic vein treatment doctors", hae: "Hemorrhoid embolization doctors" };
const COLOR = { ufe: "t-fibroids", pae: "t-pae", gae: "t-gae", pelvic: "t-cpp", hae: "t-hem" };
const ALL = ["ufe", "pae", "gae", "pelvic", "hae"];   // pelvic: job platform-directory-0009; hae: job 0029
const PAGE_OF = { ufe: "/fibroids/", pae: "/enlarged-prostate/", gae: "/knee-arthritis/", pelvic: "/chronic-pelvic-pain/", hae: "/hemorrhoids/" };
// The condition's every-option page, where one exists (pattern: docs/condition-pattern.md; city pages link to it).
const OPTIONS_OF = { ufe: "/fibroids/every-option/", gae: "/knee-arthritis/every-option/", pae: "/enlarged-prostate/every-option/", hae: "/hemorrhoids/every-option/" };
const COMPARE_LINK = { ufe: "Compare fibroid embolization with myomectomy, hysterectomy, and medicines", gae: "Compare knee embolization with knee replacement, shots, and medicines", pae: "Compare prostate artery embolization with TURP, laser surgery, office procedures, and medicines",
  hae: "Compare hemorrhoid embolization with banding, other office treatments, and surgery" };   // hae: job platform-directory-0029
const TEST_NPIS = new Set(["1999999990"]);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
// Procedure names in city-page text: his GAE form (2026-11-05), the shared list for the rest.
const LONG = { ...PROC_LONG, gae: "Genicular (knee) artery embolization (GAE)" };
// " (UFE)" after the patient's words in a heading; nothing for a procedure with no abbreviation (pelvic, job 0009),
// where PROC_SHORT already holds the plain words.
const PAREN = Object.fromEntries(Object.keys(PROC_SHORT).map((k) => [k, PROC_SHORT[k] === lower(PROC_LONG[k]) ? "" : ` (${PROC_SHORT[k]})`]));
const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico" };

// ---- the finder's rules, server side (tools/cities-job42.test.mjs runs finder.js's own functions against these) ----
export function miles(a, b) {
  const R = 3958.8, rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function place(p, center, r) {              // finder.js place()
  const c = { ...p };
  let best = null;
  if (p.offices && p.offices.some((o) => o.lat != null && o.lon != null)) {
    c.offices = p.offices.map((o) => {
      const x = { ...o };
      x.miles = o.lat != null && o.lon != null ? miles(center, [o.lat, o.lon]) : null;
      if (x.miles != null && x.miles <= r && (!best || x.miles < best.miles)) best = x;
      return x;
    });
    if (!best) return null;
    c.lead = best; c.miles = best.miles; return c;
  }
  if (p.lat === null || p.lon === null || p.lat === undefined) return null;
  c.miles = miles(center, [p.lat, p.lon]);
  return c.miles <= r ? c : null;
}
// A metro with two centers: the doctor is placed at the nearer one (the union of both circles).
export function placeMetro(p, m, r) {
  let best = null;
  for (const c of m.centers) { const x = place(p, c.ll, r); if (x && (!best || x.miles < best.miles)) best = x; }
  return best;
}
const CARD_KEYS = ["insurances", "insurance_other", "insurance_confirm", "booking_url"];
export function mergeOverlay(people, ov) {          // finder.js mergeOverlay(), on the people array
  if (!ov) return people;
  const out = people.slice(), at = {}, gone = {};
  out.forEach((p, i) => { at[p.npi] = i; });
  (ov.removed || []).forEach((n) => { gone[n] = 1; });
  for (const c of ov.people || []) {
    const i = at[c.npi];
    const p = i === undefined ? { npi: c.npi, name: c.name, path: c.path || "", badge: "account", practice: "", city: "", state: "", city_label: "",
      phone: "", url: "", lat: null, lon: null } : { ...out[i] };
    p.confirmed = !!c.confirmed;
    if (p.confirmed) delete p.from_account; else p.from_account = true;
    const offs = (c.offices || []).filter((o) => o && o.city);
    if (offs.length) {
      const f = offs[0];
      p.practice = f.practice || p.practice; p.city = f.city; p.state = f.state; p.phone = f.phone || p.phone; p.city_label = "";
      if (f.lat != null && f.lon != null) { p.lat = f.lat; p.lon = f.lon; }
      p.offices = offs;
    } else delete p.offices;
    for (const k of CARD_KEYS) { if (c[k] && !(Array.isArray(c[k]) && !c[k].length)) p[k] = c[k]; else delete p[k]; }
    if (p.confirmed && c.photo) p.photo = c.photo; else delete p.photo;
    const tele = p.confirmed ? publicTelehealth(c.telehealth) : null;    // job platform-directory-0007: Confirmed only
    if (tele) p.telehealth = tele; else delete p.telehealth;
    if (c.blurb) p.blurb = c.blurb; else delete p.blurb;
    if (i === undefined) { at[c.npi] = out.length; out.push(p); } else out[i] = p;
    delete gone[c.npi];
  }
  return out.filter((p) => !gone[p.npi]);
}
const byNear = (a, b) => a.miles - b.miles || (a.name < b.name ? -1 : 1);   // finder.js run()
export function metroList(people, m, r = CITIES.radius) {
  return people.filter((p) => !p.test && !TEST_NPIS.has(p.npi)).map((p) => placeMetro(p, m, r)).filter(Boolean).sort(byNear);
}

// ---- cards: the same fields and words as finder.js card() ----
function showPhone(p) {
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
const mi = (m) => (m < 1 ? "under 1 mi" : Math.round(m) + " mi");
const PHOTO = /^\/(photos|api\/photo)\/[0-9]{10}-[0-9a-f]{8,32}\.(jpg|png|webp)$/;

export function card(p, proc) {
  const lead = p.lead || null, practice = lead ? lead.practice : p.practice;
  const photo = p.confirmed && PHOTO.test(p.photo || "") ? `<img class="photo" src="${esc(p.photo)}" alt="Photo of ${esc(p.name)}" width="64" height="64" loading="lazy" decoding="async">` : "";
  const where = [practice ? `<span class="practice">${esc(practice)}</span><br>` : "", lead && lead.street ? esc(lead.street) + "<br>" : "",
    esc(lead ? `${lead.city}, ${lead.state}` : `${p.city}, ${p.state}`)].join("");
  const phone = lead && lead.phone ? lead.phone : p.phone, tel = telHref(phone);
  const book = p.booking_url ? safeUrl(p.booking_url, true) : "", page = p.url ? safeUrl(p.url) : "";
  const acts = [tel ? `<a class="call" href="${esc(tel)}">Call ${esc(showPhone(phone))}</a>` : "",
    book ? `<a class="book" href="${esc(book)}" rel="noopener nofollow" target="_blank">Website</a>` : "",
    page ? `<a class="page" href="${esc(page)}" rel="noopener nofollow" target="_blank" aria-label="Doctor's website, opens in a new tab">Doctor's website &#x2197;</a>` : ""].filter(Boolean);
  const ins = [...(p.insurances || []), ...(p.insurance_other ? [p.insurance_other] : [])];
  const all = p.offices || [];
  const offices = all.length > 1 ? `<div class="offices"><p class="k">All offices (${all.length})</p><ul>${all.map((o) => {
    const t = telHref(o.phone), own = o === lead && o.phone === phone;
    return `<li class="${o === lead ? "lead" : ""}">${o.practice ? `<span class="practice">${esc(o.practice)}</span><br>` : ""}${
      esc((o.street ? o.street + ", " : "") + o.city + ", " + o.state + (o.zip ? " " + o.zip : ""))}${
      o.miles != null ? `<span class="odist">\u00a0· ${mi(o.miles)}</span>` : ""}${t && !own ? `<br><a href="${esc(t)}">${esc(showPhone(o.phone))}</a>` : ""}</li>`;
  }).join("")}</ul></div>` : "";
  const q = `?npi=${encodeURIComponent(p.npi)}&procedure=${proc}&name=${encodeURIComponent(p.name)}`;
  const report = `<a href="/report/${esc(q)}">Report an error</a>`;
  const tele = p.confirmed ? teleBadge(p.telehealth) : "";
  return `<li class="${p.confirmed ? "card card-confirmed" : "card"}">${p.confirmed ? `<div class="card-tags"><p class="confirmed-tag">\u2713 Confirmed by physician</p>${tele}</div>` : ""}`
    + `<div class="top">${photo}<div class="who"><h3><a href="${esc(profileHref(p))}">${esc(p.name)}</a></h3>`
    + `<span class="badge">Interventional radiologist</span></div><span class="dist">${mi(p.miles)}</span></div>`
    + `<p class="where">${where}</p>`
    + (p.confirmed ? "" : '<p class="confirm-office small muted">Details not confirmed by this doctor. Check with the office before you go.</p>')
    + (lead && lead.geo === "address" ? '<p class="dist-note small muted">Distance is from the city center to this office.</p>' : "")
    + (p.blurb ? `<p class="blurb">${esc(p.blurb)}</p>` : "")
    + (ins.length || p.insurance_confirm ? `<p class="ins"><span class="k">Insurance: </span>${esc(ins.join(", "))}${ins.length && p.insurance_confirm ? ". " : ""}${p.insurance_confirm ? '<span class="confirm">Confirm with the office.</span>' : ""}</p>` : "")
    + (acts.length ? `<div class="actions">${acts.join("")}</div>` : "") + offices
    + `<p class="claim" style="margin:10px 0 0">${p.confirmed ? report : `<a href="/account/${esc(q)}">Is this you? Claim this free profile</a><span class="sep" aria-hidden="true">·</span>${report}`}</p></li>`;
}

// ---- page parts ----
const centersText = (m) => m.centers.map((c) => `ZIP ${c.zip} (${c.label})`).join(" or ");
const dateText = (iso) => { const d = new Date(iso + "T12:00:00Z"); return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const town = (p) => (p.lead ? `${p.lead.city}, ${p.lead.state}` : `${p.city}, ${p.state}`);

export function answer(proc, m, list) {
  const n = list.length, c = list.filter((p) => p.confirmed).length, towns = new Set(list.map(town)).size;
  const name = lower(LONG[proc]), abbr = PROC_SHORT[proc];
  const who = c ? `for ${name}. ${c === 1 ? "One confirmed it" : `${c} confirmed it`} themselves, and ${n - c === 1 ? "one likely performs" : `${n - c} likely perform`} it.`
    : `who likely perform ${name}.`;
  return `We list ${plural(n, "doctor", "doctors")} within ${CITIES.radius} miles of ${centersText(m)} ${who} `
    + `${towns === 1 ? "They all work in one town." : `They work in ${towns} towns.`} The list is free and goes nearest first. `
    + `It is not a ranking. Call the office to ask whether ${abbr} is right for you.`;
}

// Job platform-main-0013: local facts under the answer, each line a whole sentence that stands alone (so an answer engine
// can lift it), all counted from the same live list as the cards. "Listed", never "practicing": a location can be a
// stale public record. Practices are a count only, never names (content-pipeline rule).
const milesText = (x) => (x < 1 ? "under 1 mile" : Math.round(x) === 1 ? "1 mile" : `${Math.round(x)} miles`);
const practiceOf = (p) => String((p.lead ? p.lead.practice : p.practice) || "").trim().toLowerCase().replace(/\s+/g, " ");
export function facts(proc, m, list, others = []) {
  const n = list.length;
  if (!n) return [];
  const abbr = PROC_SHORT[proc], when = dateText(CITIES.as_of), c = list.filter((p) => p.confirmed).length;
  const near10 = list.filter((p) => p.miles <= 10).length, towns = new Set(list.map(town)).size;
  const practices = new Set(list.map(practiceOf).filter(Boolean)).size;
  const nearest = Math.min(...list.map((p) => p.miles));
  const out = [
    `As of ${when}, we list ${plural(near10, "doctor", "doctors")} for ${abbr} within 10 miles of ${centersText(m)}, and ${n} within ${CITIES.radius} miles.`,
    `The nearest listed ${abbr} doctor ${m.place} is ${milesText(nearest)} from ${centersText(m)}.`,
    `The ${plural(n, "doctor", "doctors")} listed for ${abbr} ${m.place} ${towns === 1 ? "all work in one town" : `work in ${towns} towns`}${practices ? `, at ${plural(practices, "separate practice", "separate practices")}` : ""}.`,
    c ? `${c} of the ${n} doctors listed for ${abbr} ${m.place} ${c === 1 ? "has" : "have"} confirmed it on Every Option.`
      : `None of the ${n === 1 ? "doctor" : `${n} doctors`} listed for ${abbr} ${m.place} ${n === 1 ? "has" : "have"} confirmed it on Every Option yet.`,
  ];
  const more = others.filter((o) => o.n > 0).map((o) => `${plural(o.n, "doctor", "doctors")} for ${PROC_SHORT[o.proc]}`);
  if (more.length) out.push(`In the same area, we also list ${more.join(" and ")}.`);
  return out;
}
const townId = (t) => "town-" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const GROUP_AT = 5;   // pages with this many towns or more group the Likely cards by town

function crumbs(items) {
  const html = `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([t, u], i) => `<li>${i === items.length - 1
    ? `<span aria-current="page">${esc(t)}</span>` : `<a href="${esc(u)}">${esc(t)}</a>`}</li>`).join("")}</ol></nav>`;
  const json = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([t, u], i) =>
    ({ "@type": "ListItem", position: i + 1, name: t, item: ORIGIN + u })) };
  return { html, json };
}

function tier(list, cls, title, note, proc, groups) {
  const head = `<section class="tier ${cls}" aria-label="${esc(title)}"><h3>${esc(title)}<span class="count">${plural(list.length, "doctor", "doctors")}</span></h3>`
    + `<p class="tier-note">${esc(note)}</p>`;
  if (!groups) return head + `<ol class="cards">${list.map((p) => card(p, proc)).join("")}</ol></section>`;
  // grouped by town: plain links and headings, so every card shows with JavaScript off; nearest first inside each town
  return head + `<p class="towns" id="towns"><span class="k">Jump to a town:</span> ${groups.map(([t, ps]) =>
    `<a href="#${townId(t)}">${esc(t)}\u00a0${ps.length}</a>`).join(" · ")}</p>`
    + groups.map(([t, ps]) => `<div class="town-group"><h4 id="${townId(t)}">${esc(t)}<span class="count">${plural(ps.length, "doctor", "doctors")}</span></h4>`
      + `<ol class="cards">${ps.map((p) => card(p, proc)).join("")}</ol><p class="to-towns small"><a href="#towns">Back to the town list</a></p></div>`).join("")
    + `</section>`;
}

// "What else is done here": that procedure's own page for this metro when it has one (S3, job platform-main-0024),
// else its condition page.
const otherHref = (k, m) => ((CITIES.metros[k] || []).some((x) => x.slug === m.slug) ? `${CITIES.hub[k]}${m.slug}/` : PAGE_OF[k]);
export function renderMetro(proc, m, list, others, near, live) {
  const hub = CITIES.hub[proc], path = `${hub}${m.slug}/`, abbr = PROC_SHORT[proc], name = lower(LONG[proc]);
  const confirmed = list.filter((p) => p.confirmed), likely = list.filter((p) => !p.confirmed);
  const cr = crumbs([["Home", "/"], [CONDITION_LABEL[proc], PAGE_OF[proc]], [HUB_LABEL[proc], hub], [m.name, path]]);
  const towns = {};
  for (const p of list) towns[town(p)] = (towns[town(p)] || 0) + 1;
  const townList = Object.entries(towns).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  // likely cards by town, in the town line's order (most doctors first, then by name); each town's cards keep list order
  const byTown = new Map();
  for (const p of likely) { const t = town(p); if (!byTown.has(t)) byTown.set(t, []); byTown.get(t).push(p); }
  const groups = townList.length >= GROUP_AT ? [...byTown.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1)) : null;
  const factLines = facts(proc, m, list, others);
  const records = list.filter((p) => /public records/i.test(p.city_label || "")).length;
  const zip = m.centers[0].zip;
  const list_html = list.length
    ? (confirmed.length ? tier(confirmed, "tier-a", "Confirmed by physician", "These doctors confirmed they perform this procedure. Nearest first.", proc)
      // the same line as the ZIP search (finder.js), so a doctor sees the open spot and claims it (his words, 2026-11-05)
      : `<section class="tier tier-empty" aria-label="Confirmed by physician"><p><strong>Confirmed by physician: 0 nearby.</strong></p><p>Are you a doctor who performs this? <a href="/account/?procedure=${proc}">Make your free account</a>.</p></section>`)
      + (likely.length ? tier(likely, "tier-b", "Likely performs this procedure", groups ? "Based on public information online. Call the office to confirm. Grouped by town, nearest first in each." : "Based on public information online. Call the office to confirm. Nearest first.", proc, groups) : "")
    : `<p class="notice">No doctors are listed within ${CITIES.radius} miles right now. <a href="${PAGE_OF[proc]}?zip=${zip}&amp;r=50#finder">Search a wider area</a>.</p>`;
  const otherHtml = others.filter((o) => o.n > 0).map((o) => `<li><a href="${otherHref(o.proc, m)}">${esc(plural(o.n, "doctor", "doctors"))} ${esc(m.place)} ${o.n === 1 ? "is" : "are"} listed for ${esc(lower(LONG[o.proc]))}</a></li>`).join("");
  const nearHtml = near.map((x) => `<li><a href="${hub}${x.slug}/">${esc(x.name)}</a> <span class="muted">(${Math.round(x.miles)} mi)</span></li>`).join("");
  const blurb = (CITIES.blurbs[proc] || "");
  // job platform-condition-pages-0013: the coverage link where the walkthrough showed the question: before the doctor list
  // and after it. No link for a procedure with no coverage page.
  const cov = COVERAGE[proc] ? `<p class="cov-link"><a href="${COVERAGE[proc].path}">${esc(COVERAGE[proc].link)}</a></p>` : "";
  const body = `${cr.html}
<h1>Who does ${esc(PATIENT[proc])}${PAREN[proc]} ${esc(m.place)}?</h1>
<p class="answer">${esc(answer(proc, m, list))}</p>
${cov}
${factLines.length ? `<ul class="facts" aria-label="Local facts">${factLines.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
<h2>Which doctors ${esc(m.place)} do ${abbr}?</h2>
${list_html}
${townList.length >= 3 && !groups ? `<h2>Where are they?</h2><p class="towns">${townList.map(([t, n]) => `${esc(t)} ${n}`).join(" · ")}</p>` : ""}
<p class="find-own"><a href="${PAGE_OF[proc]}?zip=${zip}&amp;r=25#finder">Search from your own ZIP code</a> to see doctors nearest you, sorted by distance.</p>
<h2>Is ${abbr} right for me?</h2>
<p>${esc(blurb)} <a href="${PAGE_OF[proc]}">Read about your ${esc(CONDITION[proc])} treatment options</a>.</p>
${OPTIONS_OF[proc] ? `<p class="see-every"><a href="${OPTIONS_OF[proc]}">${esc(COMPARE_LINK[proc])}</a></p>` : ""}
${cov}
${otherHtml ? `<h2>What else is done ${esc(m.place)}?</h2><ul class="others">${otherHtml}</ul>` : ""}
${nearHtml ? `<h2>Nearby cities</h2><ul class="near-cities">${nearHtml}</ul>` : ""}
<h2>A blank is not a no</h2>
<p>A missing doctor usually means we have not found them yet${records >= 3 ? "; some locations come from public records and may be out of date" : ""}.</p>
<p class="small muted">This list is not a recommendation or a ranking. <a href="/how-we-know/">How we know</a>.</p>
<p class="small muted">Listings checked as of ${esc(dateText(CITIES.as_of))}. Distances run from the center of ${esc(centersText(m))}. Page last reviewed ${esc(dateText(CITIES.reviewed))}.</p>`;
  const items = { "@context": "https://schema.org", "@type": "ItemList", name: `Doctors listed for ${name} ${m.place}`, numberOfItems: list.length,
    itemListElement: list.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: ORIGIN + profileHref(p) })) };
  const robots = !live.indexable || list.length < CITIES.floor || draft(proc) ? '\n<meta name="robots" content="noindex">' : "";
  return fill({ PATH: path, TITLE: `Who does ${PATIENT[proc]} ${m.place}? | Every Option`,
    DESC: `${plural(list.length, "doctor", "doctors")} within ${CITIES.radius} miles of ${m.name} ${list.length === 1 ? "is" : "are"} listed for ${name}. Free, nearest first, not a ranking.`,
    HEAD: `<script type="application/ld+json">${ld(cr.json)}</script>\n<script type="application/ld+json">${ld(items)}</script>${robots}`, BODY: body, COLOR: COLOR[proc] });
}

export function renderHub(proc, people, metros) {
  const hub = CITIES.hub[proc], abbr = PROC_SHORT[proc], name = lower(LONG[proc]);
  const cr = crumbs([["Home", "/"], [CONDITION_LABEL[proc], PAGE_OF[proc]], [HUB_LABEL[proc], hub]]);
  const listed = people.filter((p) => !p.test && !TEST_NPIS.has(p.npi) && (p.lat != null || (p.offices || []).some((o) => o.lat != null)));
  const states = {};
  for (const p of listed) if (p.state) (states[p.state] ||= { n: 0, metros: new Set() }).n++;
  for (const x of metros) for (const p of x.list) if (states[p.state]) states[p.state].metros.add(x.m.slug);
  const metroName = Object.fromEntries(metros.map((x) => [x.m.slug, x.m.name]));
  const stateHtml = Object.keys(states).sort((a, b) => (STATES[a] || a).localeCompare(STATES[b] || b)).map((s) => {
    const ms = [...states[s].metros].sort((a, b) => metroName[a].localeCompare(metroName[b]));
    return `<li id="${s.toLowerCase()}"><strong>${esc(STATES[s] || s)}</strong>: ${esc(plural(states[s].n, "doctor", "doctors"))} listed${
      ms.length ? `. City pages: ${ms.map((x) => `<a href="${hub}${x}/">${esc(metroName[x])}</a>`).join(", ")}` : ""}</li>`;
  }).join("");
  const metroHtml = metros.map((x) => `<li><a href="${hub}${x.m.slug}/">${esc(x.m.name)}</a> <span class="muted">${esc(plural(x.list.length, "doctor", "doctors"))}</span></li>`).join("");
  const body = `${cr.html}
<h1>Where can I get ${esc(PATIENT[proc])}${PAREN[proc]}?</h1>
<p class="answer">We list ${esc(plural(listed.length, "doctor", "doctors"))} in ${Object.keys(states).length} states for ${esc(name)}. Each city page lists every doctor within ${CITIES.radius} miles of the city, nearest first. It is not a ranking.</p>
<h2>Cities</h2>
<ul class="metro-list">${metroHtml}</ul>
<p class="small muted">A city gets its own page when we list at least ${CITIES.bar} doctors within ${CITIES.radius} miles of it.</p>
<h2>States</h2>
<ul class="state-list">${stateHtml}</ul>
<p class="find-own"><a href="${PAGE_OF[proc]}#finder">Search by your ZIP code</a> to see doctors nearest you, sorted by distance.</p>
<h2>A blank is not a no</h2>
<p>If a doctor is missing, it usually means we have not found them yet.</p>
<p class="small muted">This list is not a recommendation or a ranking. <a href="/how-we-know/">How we know</a>.</p>
<p class="small muted">Listings checked as of ${esc(dateText(CITIES.as_of))}. Page last reviewed ${esc(dateText(CITIES.reviewed))}.</p>`;
  return fill({ PATH: hub, TITLE: `Where can I get ${PATIENT[proc]}${PAREN[proc]}? Doctors by city | Every Option`,
    DESC: `Doctors listed for ${name}, by city and state. Free, nearest first, not a ranking.`,
    HEAD: `<script type="application/ld+json">${ld(cr.json)}</script>${draft(proc) ? '\n<meta name="robots" content="noindex">' : ""}`, BODY: body, COLOR: COLOR[proc] });
}

function fill(v) {
  const vals = { ...v, TITLE: esc(v.TITLE), DESC: esc(v.DESC) };
  return CITY_SHELL.replace(/%%(HEAD|BODY|PATH|TITLE|DESC|COLOR)%%/g, (_, k) => vals[k] ?? "");
}

// ---- the request ----
const ROUTE = /^\/(fibroids|enlarged-prostate|knee-arthritis|chronic-pelvic-pain|hemorrhoids)\/doctors(?:\/([^/]*)(\/?))?$/;   // [1] condition, [2] slug ("" for the hub), [3] closing slash
const PROC_OF_PATH = { fibroids: "ufe", "enlarged-prostate": "pae", "knee-arthritis": "gae", "chronic-pelvic-pain": "pelvic", hemorrhoids: "hae" };
// A city page whose condition page is still a draft sends noindex (S3, job platform-main-0024; set by the build).
const draft = (proc) => (CITIES.draft || []).includes(proc);
const lists = new Map();      // proc -> static people (never stale within one deploy)
const mem = new Map();        // path -> { at, status, html, location, noindex }
export function resetCities() { lists.clear(); mem.clear(); }

async function list(assets, proc) {
  if (!lists.has(proc)) lists.set(proc, assets.fetch(new Request(`https://assets.local/data/${proc}.json`))
    .then((r) => { if (!r.ok) throw new Error("list " + r.status); return r.json(); }).then((d) => d.people));
  try { return await lists.get(proc); } catch (e) { lists.delete(proc); throw e; }
}
async function notFound(assets) {
  for (const u of ["/404", "/404.html"]) {
    const r = await assets.fetch(new Request("https://assets.local" + u)).catch(() => null);
    if (r && r.ok) return r.text();
  }
  return "<!doctype html><title>Page not found</title><p>Page not found.</p>";
}
const headers = (host, extra = {}) => ({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${TTL}`, ...SECURITY,
  ...(PROD.has(host) ? {} : { "X-Robots-Tag": "noindex" }), ...extra });

// Returns a Response for a city address, or null for anything else.
export async function handleCity(request, env = {}) {
  const url = new URL(request.url), m = ROUTE.exec(url.pathname);
  if (!m) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("", { status: 405, headers: headers(url.hostname, { Allow: "GET, HEAD", "Cache-Control": "no-store" }) });
  const proc = PROC_OF_PATH[m[1]], slug = m[2] || "", now = (env.now || Date.now)();
  const out = (r) => new Response(request.method === "HEAD" ? null : r.html, { status: r.status,
    headers: headers(url.hostname, r.location ? { Location: r.location } : r.status === 503 ? { "Retry-After": "60", "Cache-Control": "no-store" } : {}) });
  const metros = CITIES.metros[proc] || [];
  const metro = slug ? metros.find((x) => x.slug === slug) : null;
  if (slug && !metro) return out({ status: 404, html: await notFound(env.ASSETS) });
  if (slug ? !m[3] : m[2] === undefined) return out({ status: 301, html: "", location: `${CITIES.hub[proc]}${slug ? slug + "/" : ""}` });
  const hit = mem.get(url.pathname);
  if (!env.noCache && hit && now - hit.at < TTL * 1000) return out(hit);
  const cache = !env.noCache && typeof caches !== "undefined" ? caches.default : null, ckey = new Request(url.origin + url.pathname);
  const cached = cache && (await cache.match(ckey));
  if (cached) return cached;
  let base;
  try { base = Object.fromEntries(await Promise.all((metro ? ALL : [proc]).map(async (k) => [k, await list(env.ASSETS, k)]))); }
  catch (_) { return out({ status: 503, html: "<!doctype html><title>Try again</title><p>Please try again in a minute.</p>" }); }
  const { ov } = await liveOverlay(env, now);               // null when the database is off, down or slow: static list
  const live = Object.fromEntries(Object.entries(base).map(([k, people]) => [k, mergeOverlay(people, ov && ov[k])]));
  const indexable = PROD.has(url.hostname);
  let html;
  if (metro) {
    const here = metroList(live[proc], metro);
    const others = ALL.filter((k) => k !== proc).map((k) => ({ proc: k, n: metroList(live[k], metro).length }));
    const near = metros.filter((x) => x.slug !== metro.slug).map((x) => ({ ...x, miles: Math.min(...x.centers.flatMap((a) => metro.centers.map((b) => miles(a.ll, b.ll)))) }))
      .filter((x) => x.miles <= 250).sort((a, b) => a.miles - b.miles).slice(0, 3);
    html = renderMetro(proc, metro, here, others, near, { indexable });
  } else {
    html = renderHub(proc, live[proc], metros.map((x) => ({ m: x, list: metroList(live[proc], x) })));
  }
  const r = { at: now, status: 200, html };
  if (!env.noCache) { mem.set(url.pathname, r); if (mem.size > 200) mem.clear(); }
  const res = out(r);
  if (cache && request.method === "GET") { const put = cache.put(ckey, res.clone()).catch(() => {}); if (env.waitUntil) env.waitUntil(put); }
  return res;
}
