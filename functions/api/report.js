// Cloudflare Pages Function: POST /api/report. Stores an error report about a listing. Anyone can send one.
// A report never changes a listing: this file writes reports to the CLAIMS store and, with the accounts database
// configured, one rate counter there (eo_hit, table rate_hits); it never touches listings, accounts or profiles.
// Claiming a profile is separate (/account/, physicians only, his words 2026-11-02).
// Storage: the KV namespace bound as CLAIMS. Until that binding exists the endpoint answers 503 and stores nothing.
// Limits: 8 KB body cap, 5 reports per connection per hour (IPv6 by /64; keyed by a hash of the IP, never in the record, kept up to 3 days: eo_cleanup deletes counter windows older than 2 days, daily),
// duplicate guard (same content within 24 h returns the first answer), honeypot field. Errors are logged without the
// sender's details. Decision 5A (his yes, 2026-11-04): with the accounts database configured, the hourly limit is
// counted there in one atomic step (eo_hit, its rate_hits table only), so parallel sends cannot slip past it, and a
// report costs 2 storage writes; reports are deleted after 1 year. Without it, the old storage counter (soft) is used.
import { PROCS } from "../../lib/procedures.mjs";
import { API_SECURITY } from "../../lib/security-headers.mjs";
import { connKey } from "../../lib/accounts/util.mjs";
import { supabaseData } from "../../lib/accounts/supabase.mjs";

const MAX_BYTES = 8 * 1024;
const PER_HOUR = 5;
const KEEP_SECONDS = 365 * 86400;          // decision 5A: a report is deleted after 1 year
export const REASONS = ["not_performed", "contact", "moved", "other"];
const LIMITS = { doctor: 120, email: 200, note: 2000, listing: 10, procedure: 8, submission_id: 64 };

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...API_SECURITY } });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function npiOk(n) {
  if (!/^\d{10}$/.test(n)) return false;
  const s = "80840" + n.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    let d = +s[s.length - 1 - i];
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === +n[9];
}

// Doctor: the listing's NPI from the card link, or a typed name. Reason: one choice. Details and email optional.
export function validate(b) {
  const bad = [];
  const str = (k) => (typeof b[k] === "string" ? b[k].trim() : "");
  const out = {};
  for (const k of Object.keys(LIMITS)) {
    out[k] = str(k);
    if (out[k].length > LIMITS[k]) bad.push(k);
  }
  out.reason = REASONS.includes(b.reason) ? b.reason : "";
  if (!out.reason) bad.push("reason");
  if (out.listing && !npiOk(out.listing)) bad.push("listing");
  if (!out.listing && out.doctor.length < 2) bad.push("doctor");
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) bad.push("email");
  if (out.procedure && !PROCS.includes(out.procedure)) out.procedure = "";
  return { bad: [...new Set(bad)], clean: out };
}

async function logError(env, where, err) {
  const msg = `${where}: ${err && err.message ? err.message : String(err)}`.slice(0, 300);
  console.error("report-form", msg);          // visible in the Pages project's Functions logs
  try {
    if (env.CLAIMS) await env.CLAIMS.put(`err:${new Date().toISOString()}:${crypto.randomUUID()}`, msg,
      { expirationTtl: 60 * 60 * 24 * 30 });
  } catch (_) { /* logging must never break the answer */ }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.CLAIMS) return json(503, { error: "not_open" });
    const len = +(request.headers.get("Content-Length") || 0);
    if (len > MAX_BYTES) return json(413, { error: "too_large" });
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return json(413, { error: "too_large" });
    let body;
    try { body = JSON.parse(raw); } catch (_) { return json(400, { error: "bad_json" }); }
    if (!body || typeof body !== "object") return json(400, { error: "bad_json" });
    if (body.website) return json(200, { ok: true });        // honeypot: answer as if stored, store nothing

    const ip = connKey(request.headers.get("CF-Connecting-IP") || "unknown");
    const ipHash = (await sha256("eo-report:" + ip)).slice(0, 24);
    const { bad, clean } = validate(body);
    if (bad.length) return json(400, { error: "invalid", fields: bad });

    const sid = clean.submission_id || crypto.randomUUID();
    const fingerprint = await sha256(JSON.stringify([clean.listing, clean.doctor.toLowerCase(), clean.procedure,
      clean.reason, clean.note, clean.email.toLowerCase()]));
    const seen = await env.CLAIMS.get(`dup:fp:${fingerprint}`);
    if (seen) return json(200, { ok: true, duplicate: true, id: seen });

    const hit = env.__reportHit || (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY   // __reportHit: tests only
      ? supabaseData(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).hit : null);
    let under = null;
    if (hit) { try { under = !!(await hit(`report_ip:${ipHash}`, 3600, PER_HOUR)); } catch (e) { await logError(env, "limit", e); } }
    if (under === false) return json(429, { error: "rate_limited" });
    if (under === null) {                   // no database, or it failed: the storage counter, as before
      const rlKey = `rl:${ipHash}:${new Date().toISOString().slice(0, 13)}`;
      const n = +((await env.CLAIMS.get(rlKey)) || 0);
      if (n >= PER_HOUR) return json(429, { error: "rate_limited" });
      await env.CLAIMS.put(rlKey, String(n + 1), { expirationTtl: 60 * 60 * 2 });
    }
    const id = `${new Date().toISOString()}:${sid}`;
    const record = { ...clean, submission_id: sid, received: new Date().toISOString(), kind: "error report",
      changes_listing: false };   // no IP or IP hash: the hash lives only in the rate counter (KV key 2 hours, or rate_hits up to 3 days)
    await env.CLAIMS.put(`report:${id}`, JSON.stringify(record), { expirationTtl: KEEP_SECONDS });
    await env.CLAIMS.put(`dup:fp:${fingerprint}`, id, { expirationTtl: 60 * 60 * 24 });
    return json(201, { ok: true, id });
  } catch (err) {
    await logError(env, "post", err);
    return json(500, { error: "server" });
  }
}

export async function onRequest() {        // every method but POST (Pages sends POST to onRequestPost)
  return json(405, { error: "method" });
}
