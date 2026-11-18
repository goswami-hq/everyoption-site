// Written by tools/build.py from lib/telehealth.mjs. Edit that file, not this one.
(function () {
// Job platform-directory-0007 (his words, 2026-11-06: "For every physician entry, we should add a property: Whether they
// see telemedicine consultations or not ... It should be only on confirmed profiles and it should be prominent visually").
// One profile field, telehealth: { offers: true | false | null, states: ["NY", ...] }. null: not answered, shows nothing.
// states: where the doctor can see a patient by video or phone (a patient must be in a state where the doctor is licensed).
// Any holder may save it; only a Confirmed (full access) card shows it. The accounts service, the overlay, the export,
// the profile and city renderers import this file; tools/build.py writes the browser copy (site/assets/telehealth.js,
// window.EO_TELE) from it, so the finder and the account page use the same checks and the same markup.
// Browser-safe: no imports; top-level `export const` / `export function` only (the build strips the word `export`).

// The 50 states, DC, and the five inhabited territories: 56 codes.
const TELE_STATES = ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ " +
  "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP").split(" ");
const TELE_MAX = 56;
const TELE_DEFAULT = { offers: null, states: [] };

// The saved value, or null when the input is not a valid answer. offers: true needs at least one state.
function cleanTelehealth(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (Object.keys(v).some((k) => k !== "offers" && k !== "states")) return null;
  const offers = v.offers === undefined ? null : v.offers;
  if (offers !== true && offers !== false && offers !== null) return null;
  const states = v.states === undefined ? [] : v.states;
  if (!Array.isArray(states) || states.length > TELE_MAX) return null;
  if (states.some((s) => typeof s !== "string" || TELE_STATES.indexOf(s) < 0)) return null;
  const uniq = TELE_STATES.filter((s) => states.indexOf(s) >= 0);
  if (offers === true && !uniq.length) return null;
  return { offers, states: uniq };
}

// What a public card may carry: { offers: true, states } or { offers: false, states: [] }; null for anything else.
// The caller decides who is Confirmed; this only shapes the value.
function publicTelehealth(v) {
  const c = cleanTelehealth(v);
  if (!c || c.offers === null) return null;
  return c.offers ? { offers: true, states: c.states } : { offers: false, states: [] };
}

// The state of a ZIP code from its first three digits (USPS sectional centers sit inside one state). "" when unknown
// or military. Five-digit exceptions: 96799 American Samoa, 96950-96952 Northern Mariana Islands.
const ZIP3 = ("005NY 006PR 008VI 009PR 010MA 028RI 030NH 039ME 050VT 055MA 056VT 060CT 070NJ 090-- 100NY 150PA 197DE 200DC " +
  "201VA 202DC 206MD 220VA 247WV 270NC 290SC 300GA 320FL 340-- 341FL 350AL 370TN 386MS 398GA 400KY 430OH 460IN 480MI 500IA " +
  "530WI 550MN 569DC 570SD 580ND 590MT 600IL 630MO 660KS 680NE 700LA 716AR 730OK 733TX 734OK 750TX 800CO 820WY 832ID " +
  "840UT 850AZ 870NM 885TX 889NV 900CA 962-- 967HI 969GU 970OR 980WA 995AK").split(" ");
function zipState(zip) {
  const z = String(zip || "");
  if (!/^\d{5}$/.test(z)) return "";
  if (z === "96799") return "AS";
  if (z >= "96950" && z <= "96952") return "MP";
  const n = +z.slice(0, 3);
  let st = "";
  for (const r of ZIP3) { if (+r.slice(0, 3) <= n) st = r.slice(3); else break; }
  return st === "--" || n < 5 ? "" : st;
}

// Markup. No user text reaches it: the states are checked codes, and the words are fixed.
const CAMERA = '<svg class="tele-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<rect x="1.75" y="5" width="11.5" height="10" rx="2.25" fill="none" stroke="currentColor" stroke-width="1.75"/>' +
  '<path d="M13.25 8.6 18.25 6v8l-5-2.6z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>';
function teleBadge(v) {
  const t = publicTelehealth(v);
  return t && t.offers ? `<span class="tele-badge">${CAMERA}Video visits</span>` : "";
}
function teleStatesText(v) {
  const t = publicTelehealth(v);
  return t && t.offers ? "Can see patients in: " + t.states.join(", ") : "";
}
// The profile: the badge and the states line under it; "No video visits" for a doctor who said no; nothing when unanswered.
function teleProfile(v) {
  const t = publicTelehealth(v);
  if (!t) return "";
  if (!t.offers) return '<p class="tele-none small muted">No video visits</p>';
  return `<div class="tele">${teleBadge(t)}<p class="tele-states">${teleStatesText(t)}</p></div>`;
}
// Does this card offer video visits to a patient in this state ("" state: none can be matched)?
function teleServes(v, state) {
  const t = publicTelehealth(v);
  return !!(t && t.offers && state && t.states.indexOf(state) >= 0);
}

window.EO_TELE = { TELE_STATES, TELE_MAX, TELE_DEFAULT, cleanTelehealth, publicTelehealth, zipState, teleBadge, teleStatesText, teleProfile, teleServes };
})();
