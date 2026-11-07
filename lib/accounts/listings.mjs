// Job 25 (his words, 2026-11-03: "I want live"): doctor account changes reach patient searches within about a minute.
//   GET /api/listings?procedure=ufe   public overlay for one procedure: account cards and removals, public fields only
//   GET /api/photo/<npi>-<id>.<ext>   a full-access doctor's current photo (the bucket stays private)
// One database query per cache miss (data.overlay(): profiles with their holder account and its attestations), a
// 2-second limit, and a 60-second cache keyed by the procedure alone, so traffic does not become database load.
// The request carries the procedure only, never a ZIP. The finder merges the overlay in the browser and falls back to
// the static files when this route is down or slow.
import { json, PROCS, connKey } from "./util.mjs";
import { backendFrom } from "./backend.mjs";
import { API_SECURITY } from "../security-headers.mjs";
import { publicTelehealth } from "../telehealth.mjs";

export const TTL = 60, TIMEOUT_MS = 2000, PER_MIN = 120;
const PHOTO_KEY = /^(\d{10})\/([0-9a-f]{8,32})\.(jpg|png|webp)$/;
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const str = (v, max = 300) => String(v ?? "").slice(0, max);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error("timeout")), ms); })]).finally(() => clearTimeout(t));
}

// ZIP centers from the site's own /data/zip/<first 3>.json, read through the ASSETS binding (or a test table).
export function zipCenters(assets) {
  const files = new Map();
  return async (zip) => {
    const z = String(zip || "").slice(0, 5);
    if (!/^\d{5}$/.test(z) || !assets) return null;
    const pre = z.slice(0, 3);
    if (!files.has(pre)) files.set(pre, assets.fetch(new Request(`https://assets.local/data/zip/${pre}.json`))
      .then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
    const ll = (await files.get(pre))[z];
    return Array.isArray(ll) ? ll : null;
  };
}

// The overlay. Explicit allow-list: name, offices (practice, street, city, state, ZIP, phone, point), website link,
// insurances, this procedure's note, and the photo address and video visits (telehealth) for full access. Never email, proof, history or waitlist.
// "removed": NPIs whose current holder attested this procedure and has since withdrawn it (his yes, 2026-11-03: the
// doctor leaves that list even when a public page names it). Attestation rows are never changed; no schema change.
export async function overlayFor(b, proc, zipCenter = async () => null) {
  const people = [], removed = [];
  for (const r of await b.data.overlay()) {
    const a = r.account;
    if (!a || a.npi !== r.npi || !a.level || a.level === "none") continue;
    // Listed only on the current holder's own attestation (review round 1: an undo after a takeover can put the old
    // holder's procedures back in "attested" without one).
    const on = (r.attested || []).includes(proc), own = (r.held || []).includes(proc);
    if (!on || !own) { if (own && !on) removed.push(r.npi); continue; }
    const full = a.level === "full";
    const offices = [];
    for (const o of r.offices || []) {
      const addr = o.geo === "address" && num(o.lat) !== null && num(o.lon) !== null;
      const ll = addr ? [o.lat, o.lon] : await zipCenter(o.zip);
      offices.push({ practice: str(o.practice), street: str(o.street), city: str(o.city), state: str(o.state, 2),
        zip: str(o.zip, 10), phone: str(o.phone, 40), lat: ll ? ll[0] : null, lon: ll ? ll[1] : null, geo: addr ? "address" : "zip" });
    }
    const m = PHOTO_KEY.exec(r.photo_key || "");
    people.push({ npi: r.npi, name: str(a.name, 120), confirmed: full, offices, booking_url: str(r.booking_url, 500),
      insurances: (r.insurances || []).map((x) => str(x, 80)), insurance_other: str(r.insurance_other, 200),
      insurance_confirm: !!r.insurance_confirm, blurb: str((r.blurbs || {})[proc], 1000),
      photo: full && m && m[1] === r.npi ? `/api/photo/${m[1]}-${m[2]}.${m[3]}` : "" });
    // Job platform-directory-0007: video visits only on a full-access card, and only when answered.
    const tele = full ? publicTelehealth(r.telehealth) : null;
    if (tele) people[people.length - 1].telehealth = tele;
  }
  return { procedure: proc, people, removed };
}

// Its own limit, per isolate and per IP, in memory (no database write per request); the canonical cache key bounds
// database load whatever the request rate. The account routes keep their own limits.
const hits = new Map();
function allowed(ip, now) {
  const w = Math.floor(now / 60000), k = `${ip}:${w}`, n = (hits.get(k) || 0) + 1;
  if (hits.size > 5000) hits.clear();
  hits.set(k, n);
  return n <= PER_MIN;
}
const mem = new Map();          // procedure -> { at, body }: survives between requests on a warm isolate
const photos = new Map();       // path -> { at, bytes }, at most 50
const DOWN_MS = 15000;
let downUntil = 0;              // after a database failure, answer 503 at once for 15 s
const photoResponse = (bytes, ext) => new Response(bytes, { status: 200, headers: { "Content-Type": TYPES[ext],
  "Cache-Control": `public, max-age=${TTL}`, ...API_SECURITY } });
export function resetForTests() { mem.clear(); photos.clear(); hits.clear(); downUntil = 0; }

export async function handlePublic(request, env = {}) {
  const url = new URL(request.url), now = (env.now || Date.now)();
  if (request.method !== "GET" && request.method !== "HEAD") return json(405, { error: "method" });
  if (!allowed(connKey(request.headers.get("CF-Connecting-IP") || "unknown"), now)) return json(429, { error: "rate_limited" });
  const backend = env.backend || backendFrom(env);
  const proc = url.searchParams.get("procedure");
  // Accounts not connected: an empty overlay, so the finder logs no error (the static files are the whole list).
  if (!backend) return url.pathname === "/api/listings" && PROCS.includes(proc)
    ? json(200, { procedure: proc, people: [], removed: [] }, { "Cache-Control": `public, max-age=${TTL}` }) : json(404, { error: "not_found" });
  const ms = env.listingsTimeoutMs ?? TIMEOUT_MS;
  try {
    const photo = /^\/api\/photo\/(\d{10})-([0-9a-f]{8,32})\.(jpg|png|webp)$/.exec(url.pathname);
    if (photo) {
      // 60-second cache (memory, then the Cache API): a new upload gets a new random id, so this only delays a
      // removal or downgrade by at most the TTL.
      const ph = photos.get(url.pathname);
      if (!env.noCache && ph && now - ph.at < TTL * 1000) return photoResponse(ph.bytes, photo[3]);
      const pcache = !env.noCache && typeof caches !== "undefined" ? caches.default : null;
      const pkey = new Request(url.origin + url.pathname);
      const pc = pcache && (await pcache.match(pkey));
      if (pc) return pc;
      if (now < downUntil) return json(503, { error: "unavailable" });
      const row = await withTimeout(backend.data.publicPhoto(photo[1]), ms);
      const key = `${photo[1]}/${photo[2]}.${photo[3]}`;
      if (!row || row.level !== "full" || row.photo_key !== key) return json(404, { error: "not_found" });
      const f = await withTimeout(backend.photos.get(key), ms);
      if (!f) return json(404, { error: "not_found" });
      if (!env.noCache) { if (photos.size > 50) photos.clear(); photos.set(url.pathname, { at: now, bytes: f.bytes }); }
      const res = photoResponse(f.bytes, photo[3]);
      if (pcache) { const put = pcache.put(pkey, res.clone()).catch(() => {}); if (env.waitUntil) env.waitUntil(put); }
      return res;
    }
    if (url.pathname !== "/api/listings") return json(404, { error: "not_found" });
    if (!PROCS.includes(proc)) return json(400, { error: "invalid", fields: ["procedure"] });
    const head = { "Cache-Control": `public, max-age=${TTL}` };
    const hit = mem.get(proc);
    if (!env.noCache && hit && now - hit.at < TTL * 1000) return json(200, hit.body, head);
    const cache = !env.noCache && typeof caches !== "undefined" ? caches.default : null;
    const ckey = new Request(`${url.origin}/api/listings?procedure=${proc}`);
    const cached = cache && (await cache.match(ckey));
    if (cached) return cached;
    if (now < downUntil) return json(503, { error: "unavailable" });
    const body = await withTimeout(overlayFor(backend, proc, zipCenters(env.ASSETS || backend.zipAssets)), ms);
    const res = json(200, body, head);
    if (!env.noCache) mem.set(proc, { at: now, body });
    if (cache) { const put = cache.put(ckey, res.clone()).catch(() => {}); if (env.waitUntil) env.waitUntil(put); }
    return res;
  } catch (e) {
    downUntil = now + DOWN_MS;         // review note: spare a struggling database; the finder uses the static file
    console.error("listings", e && e.message ? e.message.slice(0, 100) : "error");
    return json(503, { error: "unavailable" });
  }
}

// Hijack alert: phone, address or website link changed on a listing that already existed (an earlier save, or a
// listing found from public pages). Returns [{ field, old, new }]; empty for a brand-new doctor's first save.
export function contactChanges(before, after, listed) {
  const offs0 = before.offices || [], offs1 = after.offices ?? offs0;
  if (!offs0.length && !before.booking_url && !listed) return [];
  const join = (xs) => xs.filter(Boolean).join("; ");
  const addr = (o) => [o.street, o.city, o.state, o.zip].filter(Boolean).join(", ");
  const old = { phone: offs0.length ? join(offs0.map((o) => o.phone)) : (listed && listed.phone) || "",
    address: offs0.length ? join(offs0.map(addr)) : listed ? [listed.city, listed.state].filter(Boolean).join(", ") : "",
    website: before.booking_url || "" };
  const now = { phone: join(offs1.map((o) => o.phone)), address: join(offs1.map(addr)), website: after.booking_url ?? old.website };
  const asked = [...("offices" in after ? ["phone", "address"] : []), ...("booking_url" in after ? ["website"] : [])];
  return asked.filter((k) => old[k] !== now[k]).map((k) => ({ field: k, old: old[k], new: now[k] }));
}
