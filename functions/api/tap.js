// Cloudflare Pages Function: POST /api/tap. Counts one tap on a doctor's Call, Website or booking link (his words,
// ai-hq HQ chat 2026-11-21 09:08 CT: "Let's build 2 first", item 2 of the marketing plan of action).
// Stored: one count per day, doctor (NPI), procedure, kind of tap and kind of page (supabase/migrations/
// 2026-11-21-contact-taps.sql, function eo_tap). Nothing about the visitor is stored: no internet address, cookie,
// device detail or time finer than the day.
// Counting rules: a connection counts once per doctor and kind of tap per day (a second tap the same day is not a second
// patient), and at most 30 taps an hour; both limits live in rate_hits under a hashed key that eo_cleanup deletes within
// 2 days, as for error reports. Known crawlers and requests from other sites are not counted.
// The answer is 204 whether or not the tap was counted, so the page learns nothing; without the accounts database
// configured, or before the migration is applied, nothing is stored and the answer is still 204.
import { PROCS } from "../../lib/procedures.mjs";
import { API_SECURITY } from "../../lib/security-headers.mjs";
import { connKey } from "../../lib/accounts/util.mjs";
import { supabaseData } from "../../lib/accounts/supabase.mjs";
import { npiOk } from "./report.js";

const MAX_BYTES = 512;
const PER_HOUR = 30;
export const KINDS = ["call", "website", "booking"];
export const SRCS = ["finder", "city", "profile"];
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|curl|wget|python|node-fetch/i;
const ORIGINS = ["https://everyoptionmd.com", "https://www.everyoptionmd.com"];

const done = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...API_SECURITY } });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function validate(b) {
  if (!b || typeof b !== "object") return null;
  const npi = typeof b.npi === "string" ? b.npi : "", kind = b.kind, src = b.src;
  const proc = typeof b.proc === "string" ? b.proc : "";
  if (!npiOk(npi) || !KINDS.includes(kind) || !SRCS.includes(src)) return null;
  if (proc && !PROCS.includes(proc)) return null;
  return { npi, proc, kind, src };
}

// The page's own origin, or the live site's: a tap sent from any other site is not counted.
export function sameSite(request) {
  const o = request.headers.get("Origin");
  if (!o) return false;
  return o === new URL(request.url).origin || ORIGINS.includes(o);
}

export async function onRequestPost({ request, env }) {
  try {
    const ua = request.headers.get("User-Agent") || "";
    if (!ua || BOT.test(ua) || !sameSite(request)) return done();
    if (+(request.headers.get("Content-Length") || 0) > MAX_BYTES) return done(413);
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return done(413);
    let body; try { body = JSON.parse(raw); } catch (_) { return done(); }
    const t = validate(body);
    if (!t) return done();
    const db = env.__tapDb || (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY   // __tapDb: tests only
      ? supabaseData(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : null);
    if (!db) return done();
    const who = (await sha256("eo-tap:" + connKey(request.headers.get("CF-Connecting-IP") || "unknown"))).slice(0, 24);
    if (!(await db.hit(`tap_hour:${who}`, 3600, PER_HOUR))) return done();
    if (!(await db.hit(`tap_once:${who}:${t.npi}:${t.kind}`, 86400, 1))) return done();
    await db.tap(t.npi, t.proc, t.kind, t.src);
    return done();
  } catch (err) {
    console.error("tap", (err && err.message ? err.message : String(err)).slice(0, 200));   // no tap details, no address
    return done();
  }
}

export async function onRequest() { return done(405); }   // every method but POST
