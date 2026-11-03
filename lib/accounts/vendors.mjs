// Real adapters for the outside services, each the same shape as its stand-in in lib/accounts/local.mjs.
// None runs until backend.mjs finds every variable set (his yes on the spend approval comes first).
// Endpoints and field names follow each vendor's public API reference; re-read them when connecting.
import { PROCS } from "../procedures.mjs";
import { nameHit } from "./util.mjs";

export async function s256(v) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  return btoa(String.fromCharCode(...h)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const form = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

// Email: Resend (POST https://api.resend.com/emails).
export function resendEmail(key, from, fetchFn = (...a) => fetch(...a)) {
  return {
    async send({ to, subject, text }) {
      const r = await fetchFn("https://api.resend.com/emails", { method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }) });
      if (!r.ok) throw new Error(`email ${r.status}`);
    },
  };
}

// Identity: Stripe Identity, document plus matching selfie. We keep only the status and the verified name, then ask
// Stripe to redact the session so its copy of the images and details is removed too.
export function stripeIdentity(secret, webhookSecret, fetchFn = (...a) => fetch(...a)) {
  const H = { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" };
  const api = "https://api.stripe.com/v1/identity/verification_sessions";
  // Stripe: redaction is allowed when a session is verified or requires input; it can take up to four days.
  async function redact(id) {
    const r = await fetchFn(`${api}/${encodeURIComponent(id)}/redact`, { method: "POST", headers: H, body: "" }).catch(() => null);
    return !!(r && r.ok);
  }
  return {
    async start({ accountId, returnUrl }) {
      const r = await fetchFn(api, { method: "POST", headers: H, body: form({ type: "document",
        "options[document][require_matching_selfie]": "true", "options[document][require_live_capture]": "true",
        "metadata[account_id]": accountId, return_url: returnUrl }) });
      if (!r.ok) throw new Error(`identity start ${r.status}`);
      const j = await r.json();
      return { session: j.id, url: j.url };
    },
    async parseResult(request, env = {}) {
      const raw = await request.text();
      if (!(await verifyStripe(raw, request.headers.get("Stripe-Signature") || "", webhookSecret, env.now ? env.now() : Date.now())))
        return null;
      const ev = JSON.parse(raw);
      const id = ev.data && ev.data.object && ev.data.object.id;
      if (ev.type === "identity.verification_session.requires_input")      // failed attempts are deleted too
        return { session: id, status: "failed", redact_failed: !(await redact(id)) };
      if (ev.type !== "identity.verification_session.verified") return { ignore: true };
      const r = await fetchFn(`${api}/${encodeURIComponent(id)}?expand[]=verified_outputs`, { headers: H });
      if (!r.ok) throw new Error(`identity read ${r.status}`);
      const o = (await r.json()).verified_outputs || {};
      return { session: id, status: "verified", first: o.first_name || "", last: o.last_name || "", redact_failed: !(await redact(id)) };
    },
    // A replaced check: redact it directly (Stripe: redaction is allowed in requires_input or verified status and
    // ends the session; a cancelled session cannot be redacted). A processing session must finish first; its
    // webhook redacts it, so this returns "processing" and no exception is raised. True when the redact worked.
    async cancel(id) {
      const g = await fetchFn(`${api}/${encodeURIComponent(id)}`, { headers: H }).catch(() => null);
      const st = g && g.ok ? (await g.json()).status : "";
      if (st === "processing") return "processing";
      if (st === "canceled") return false;
      return redact(id);
    },
  };
}

// Stripe-Signature: "t=<unix>,v1=<hex hmac-sha256 of `${t}.${body}`>"; five-minute tolerance.
export async function verifyStripe(raw, header, secret, nowMs) {
  const kv = header.split(",").map((p) => p.trim().split("=")).filter((p) => p.length === 2);
  const t = +((kv.find(([k]) => k === "t") || [])[1]);
  const sigs = kv.filter(([k]) => k === "v1").map(([, v]) => v);      // several during a secret rotation
  if (!t || !sigs.length || Math.abs(nowMs / 1000 - t) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  let ok = false;
  for (const v of sigs) {
    if (v.length !== hex.length) continue;
    let d = 0; for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ v.charCodeAt(i);
    if (d === 0) ok = true;
  }
  return ok;
}

// NPPES NPI Registry, public, no account (https://npiregistry.cms.hhs.gov/api/?version=2.1&number=<npi>).
// Job 22: search by name and state as well (same API: last_name, first_name with a trailing * after 2 or more
// letters, state, enumeration_type=NPI-1, limit up to 200). Only public registry fields come back to the page.
function nppesPerson(x) {
  const tax = (x.taxonomies || []).find((t) => t.primary) || (x.taxonomies || [])[0] || {};
  const b = x.basic || {};
  const loc = (x.addresses || []).find((a) => a.address_purpose === "LOCATION") || (x.addresses || [])[0] || {};
  return x.enumeration_type === "NPI-1"
    ? { type: "NPI-1", npi: String(x.number || ""), first: b.first_name || "", last: b.last_name || "", taxonomy: tax.code || "",
        taxonomy_desc: tax.desc || "", taxonomies: (x.taxonomies || []).map((t) => t.code || ""), credential: b.credential || "",
        city: loc.city || "", state: loc.state || "" }
    : { type: x.enumeration_type, org: b.organization_name || "", taxonomy: tax.code || "", taxonomy_desc: tax.desc || "" };
}
export function nppesRegistry(fetchFn = (...a) => fetch(...a)) {
  return {
    async lookup(npi) {
      const r = await fetchFn(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${encodeURIComponent(npi)}`);
      if (!r.ok) throw new Error(`nppes ${r.status}`);
      const x = ((await r.json()).results || [])[0];
      return x ? nppesPerson(x) : null;
    },
    async search({ first, last, state }) {
      const q = new URLSearchParams({ version: "2.1", enumeration_type: "NPI-1", last_name: last, limit: "200" });   // the maximum: common names fill 50 with former-name matches
      if (first && first.length >= 2) q.set("first_name", first + "*");
      if (state) q.set("state", state);
      const r = await fetchFn(`https://npiregistry.cms.hhs.gov/api/?${q}`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(`nppes ${r.status}`);
      const j = await r.json();
      if (j.Errors) return [];
      return (j.results || []).map(nppesPerson).filter((p) => p.type === "NPI-1");
    },
  };
}

// U.S. Census geocoder, public, no account (job 16). Read 2026-11-02: geocoding.geo.census.gov/geocoder/
// Geocoding_Services_API.html (last updated 02/2026) and census.gov "Census Geocoder Documentation" (revised
// 2026-05-19). No terms, fee or rate limit stated; results are "interpolated, or approximated" along TIGER address
// ranges, not rooftop; US, Puerto Rico and Island Areas only; x is longitude, y is latitude. Server-side only (the
// service sends no CORS headers). Off in the live flow until accounts are connected (backend.mjs, GEOCODER_ON).
export function censusGeocoder(fetchFn = (...a) => fetch(...a)) {
  return {
    async locate({ street, city, state, zip }) {
      const q = new URLSearchParams({ street, city, state, zip, benchmark: "Public_AR_Current", format: "json" });
      const r = await fetchFn(`https://geocoding.geo.census.gov/geocoder/locations/address?${q}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`census geocoder ${r.status}`);
      const m = (((await r.json()).result || {}).addressMatches || [])[0];
      if (!m || !m.coordinates) return null;
      return { lat: +m.coordinates.y, lon: +m.coordinates.x, matched: m.matchedAddress || "" };
    },
  };
}

// Listings from the site's own finder data, through the Pages static-asset binding.
export function assetListings(assets, procs = PROCS) {
  let map = null;
  async function load() {
    if (map) return map;
    const m = {};
    for (const proc of procs) {
      const r = await assets.fetch(new Request(`https://assets.local/data/${proc}.json`));
      if (!r.ok) continue;
      for (const p of (await r.json()).people || []) {
        const e = (m[p.npi] ||= { npi: p.npi, name: p.name, city: p.city || "", state: p.state || "", procedures: [], urls: [] });
        e.procedures.push(proc);
        if (p.url && !e.urls.includes(p.url)) e.urls.push(p.url);
      }
    }
    return (map = m);
  }
  return { async get(npi) { return (await load())[npi] || null; },
    async search(q) { return Object.values(await load()).filter((e) => (!q.state || e.state === q.state) && nameHit(e.name, q)); } };
}

// Sign in with Doximity (OAuth 2 authorization code). URLs and profile field names come from configuration because
// Doximity gives them with an approved application; it returns name, credentials and specialty, no NPI.
export function doximityOAuth(env, fetchFn = (...a) => fetch(...a)) {
  return {
    // Doximity requires PKCE (S256): the challenge goes out here, the verifier with the token exchange.
    async authorizeUrl(state, verifier) {
      return `${env.DOXIMITY_AUTHORIZE_URL}?${form({ response_type: "code", client_id: env.DOXIMITY_CLIENT_ID,
        redirect_uri: env.DOXIMITY_REDIRECT_URI, scope: env.DOXIMITY_SCOPE || "openid profile:read:basic", state,
        code_challenge: await s256(verifier), code_challenge_method: "S256" })}`;
    },
    async profile(code, verifier) {
      const t = await fetchFn(env.DOXIMITY_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ grant_type: "authorization_code", code, redirect_uri: env.DOXIMITY_REDIRECT_URI,
          client_id: env.DOXIMITY_CLIENT_ID, client_secret: env.DOXIMITY_CLIENT_SECRET, code_verifier: verifier }) });
      if (!t.ok) return null;
      const { access_token } = await t.json();
      const r = await fetchFn(env.DOXIMITY_PROFILE_URL, { headers: { Authorization: `Bearer ${access_token}` } });
      if (!r.ok) return null;
      const p = await r.json();
      return { id: String(p.id || p.sub || ""), first: p.firstName || p.given_name || "", last: p.lastName || p.family_name || "",
        credentials: p.credentials || "", specialty: p.specialty || "" };
    },
  };
}
