// Local stand-ins for every outside service, for tools/dev-server.mjs and the tests. Nothing here leaves the machine:
// email goes to an in-memory outbox, the identity check and Doximity are simulated, NPPES answers from a fixture file.
// Each stand-in has the same methods as its real adapter (lib/accounts/supabase.mjs, lib/accounts/vendors.mjs).
import { Fail, randomToken, nameHit } from "./util.mjs";

const UNIQUE = {               // the same unique keys as supabase/schema.sql
  accounts: [["npi"], ["email"], ["doximity_id"]],
  profiles: [["npi"]],
  sessions: [["token_hash"]],
  login_links: [["token_hash"]],
  codes: [["challenge_hash"]],
  invitations: [["token_hash"], ["inviter_account_id", "slot"]],
  identity_checks: [["provider_session"]],
};

export function localData() {
  const t = new Map();
  const rows = (name) => { if (!t.has(name)) t.set(name, []); return t.get(name); };
  const hits = new Map();
  const matches = (r, m) => Object.entries(m).every(([k, v]) => (v === null ? r[k] == null : r[k] === v));
  const clone = (x) => (x == null ? x : structuredClone(x));
  let seq = 0;
  return {
    tables: t,
    async insert(table, row) {
      const r = { id: row.id || `${table}-${++seq}`, ...clone(row) };
      for (const cols of UNIQUE[table] || []) {
        if (cols.some((c) => r[c] == null)) continue;
        if (rows(table).some((x) => cols.every((c) => x[c] === r[c]))) throw new Fail(409, "conflict", { table, cols });
      }
      rows(table).push(r);
      return clone(r);
    },
    async one(table, match) { return clone(rows(table).find((r) => matches(r, match)) || null); },
    async many(table, match = {}) { return rows(table).filter((r) => matches(r, match)).map(clone); },
    async update(table, match, patch) {
      const hit = rows(table).filter((r) => matches(r, match));
      hit.forEach((r) => Object.assign(r, clone(patch)));
      return hit.map(clone);
    },
    // Fixed-window counter; true while under max. Atomic here because JS is single-threaded (Postgres: eo_hit()).
    async hit(key, windowSec, max, now = Date.now()) {
      const w = Math.floor(now / 1000 / windowSec), k = `${key}:${w}`;
      const n = (hits.get(k) || 0) + 1;
      hits.set(k, n);
      return n <= max;
    },
    // Single use, unexpired: marks used and returns the row in one step (Postgres: eo_consume_link()).
    async consumeLink(tokenHash, now = Date.now()) {
      const r = rows("login_links").find((x) => x.token_hash === tokenHash);
      if (!r || r.used_at || Date.parse(r.expires_at) <= now) return null;
      r.used_at = new Date(now).toISOString();
      return clone(r);
    },
    // A code try: counts the try, and only while unused, unexpired and under maxTries; a match marks it used and
    // returns it, in one step (Postgres: eo_try_code()).
    async tryCode(challengeHash, codeHash, maxTries, now = Date.now()) {
      const r = rows("codes").find((x) => x.challenge_hash === challengeHash);
      if (!r || r.used_at || Date.parse(r.expires_at) <= now || r.tries >= maxTries) return null;
      r.tries += 1;
      if (r.code_hash !== codeHash) return null;
      r.used_at = new Date(now).toISOString();
      return clone(r);
    },
    // Job 25: the same join as the Supabase adapter's overlay() and publicPhoto().
    async overlay() {
      return rows("profiles").map((p) => {
        const a = rows("accounts").find((x) => x.id === p.account_id);
        return { ...clone(p), account: a ? { id: a.id, npi: a.npi, level: a.level, name: a.name } : null,
          held: rows("attestations").filter((x) => a && x.account_id === a.id && x.npi === p.npi).map((x) => x.procedure) };
      });
    },
    async publicPhoto(npi) {
      const p = rows("profiles").find((x) => x.npi === npi), a = p && rows("accounts").find((x) => x.id === p.account_id);
      return a && a.npi === npi ? { photo_key: p.photo_key, level: a.level } : null;
    },
    // An invitation works once, before it expires, unless revoked (Postgres: eo_consume_invite()).
    async consumeInvite(tokenHash, now = Date.now()) {
      const r = rows("invitations").find((x) => x.token_hash === tokenHash);
      if (!r || r.used_at || r.revoked_at || Date.parse(r.expires_at) <= now) return null;
      r.used_at = new Date(now).toISOString();
      return clone(r);
    },
  };
}

// The national radiologist list, counted by last name plus first initial: key -> { n, npi (only when n is 1) }.
export function localRadiologists(map = {}) {
  return { async lookup(key) { return map[key] || null; } };
}

export function localPhotos() {
  const m = new Map();
  return {
    store: m,
    async put(key, bytes, type) { m.set(key, { bytes: new Uint8Array(bytes), type }); return key; },
    async get(key) { return m.get(key) || null; },
  };
}

export function localEmail() {
  const outbox = [];
  return { outbox, async send({ to, subject, text }) { outbox.push({ to, subject, text, at: new Date().toISOString() }); } };
}

// Simulated identity check. start() returns a local page; tests and the dev server call complete() to play the
// provider's answer. Like the real adapter, only a status and the verified name ever come back; no images exist.
export function localIdentity() {
  const sessions = new Map(), cancelled = [];
  return {
    sessions, cancelled,
    async cancel(id) { cancelled.push(id); const s = sessions.get(id); if (s) s.status = "cancelled"; return true; },
    async start({ accountId, returnUrl }) {
      const id = "vs_local_" + randomToken(8);
      sessions.set(id, { accountId, status: "pending" });
      return { session: id, url: `/__identity/?session=${id}&return=${encodeURIComponent(returnUrl || "/account/")}` };
    },
    complete(id, outcome) {             // outcome: { status: "verified" | "failed", first, last }
      const s = sessions.get(id); if (!s) return null;
      Object.assign(s, outcome);
      return { session: id, status: outcome.status, first: outcome.first || "", last: outcome.last || "" };
    },
    // Real adapter: verifies the provider's signed webhook. Local: the dev server posts a plain JSON body.
    async parseResult(request) {
      const b = await request.json();
      const s = sessions.get(b.session); if (!s) return null;
      return this.complete(b.session, b);
    },
  };
}

export function localNppes(fixture) {
  return { down: false,
    async lookup(npi) { return fixture[npi] ? { npi, ...fixture[npi] } : null; },
    async search(q) {            // same matching as the registry: last name exact, first name as a prefix
      if (this.down) throw new Error("nppes down");
      return Object.entries(fixture).filter(([, p]) => p.type === "NPI-1" && (!q.state || p.state === q.state) &&
        nameHit(`${p.first} ${p.last}`, q))
        .map(([npi, p]) => ({ npi, ...p }));
    } };
}

// Listings: npi -> { name, procedures: [...], urls: [...] } (the finder's own data, or a fixture).
export function staticListings(map) {
  return { async get(npi) { return map[npi] || null; },
    async search(q) { return Object.entries(map).filter(([, e]) => (!q.state || e.state === q.state) && nameHit(e.name, q))
      .map(([npi, e]) => ({ npi, ...e })); } };
}
export function listingsFromFinder(byProc) {        // { ufe: {people:[...]}, ... } as in site/data/<proc>.json
  const map = {};
  for (const [proc, d] of Object.entries(byProc)) for (const p of d.people || []) {
    const m = (map[p.npi] ||= { name: p.name, city: p.city || "", state: p.state || "", phone: p.phone || "", procedures: [], urls: [] });
    m.procedures.push(proc);
    if (p.url && !m.urls.includes(p.url)) m.urls.push(p.url);
  }
  return staticListings(map);
}

export function localDoximity() {
  const codes = new Map();
  return {
    codes,
    lastVerifier: null,
    async authorizeUrl(state, verifier) { return `/__doximity/?state=${encodeURIComponent(state)}`; },
    grant(profile) { const c = "dox_" + randomToken(6); codes.set(c, profile); return c; },
    async profile(code, verifier) { this.lastVerifier = verifier; const p = codes.get(code); codes.delete(code); return p || null; },  // { id, first, last, credentials, specialty }
  };
}

// Geocoder stand-in: a fixed table "street|city|state|zip" (lower case) -> [lat, lon]; anything else is no match.
// Counts calls, so tests can prove an unchanged office is never looked up again.
export function localGeocoder(table = {}) {
  const g = { calls: 0, fail: false,
    async locate(o) {
      g.calls += 1;
      if (g.fail) throw new Error("geocoder down");
      const k = [o.street, o.city, o.state, o.zip].map((x) => String(x || "").trim().toLowerCase().replace(/\s+/g, " ")).join("|");
      const hit = table[k];
      return hit ? { lat: hit[0], lon: hit[1], matched: k } : null;
    } };
  return g;
}

// Job 25: the hijack alert stand-in (the real one posts to the Every Option Telegram topic).
export function localAlert() {
  const sent = [];
  return { sent, fail: false, async send(text) { if (this.fail) throw new Error("alert down"); sent.push(text); } };
}

export function localBackend({ nppes = {}, listings = {}, radiologists = {}, doximity = false, geocodes = {} } = {}) {
  return { alert: localAlert(),
    kind: "local",
    data: localData(), photos: localPhotos(), email: localEmail(), identity: localIdentity(),
    nppes: localNppes(nppes), listings: staticListings(listings), radiologists: localRadiologists(radiologists),
    doximity: doximity ? localDoximity() : null, geocoder: localGeocoder(geocodes),
  };
}
