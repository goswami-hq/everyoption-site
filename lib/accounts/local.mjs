// Local stand-ins for every outside service, for tools/dev-server.mjs and the tests. Nothing here leaves the machine:
// email goes to an in-memory outbox, the identity check and Doximity are simulated, NPPES answers from a fixture file.
// Each stand-in has the same methods as its real adapter (lib/accounts/supabase.mjs, lib/accounts/vendors.mjs).
import { Fail, randomToken } from "./util.mjs";

const UNIQUE = {               // the same unique keys as supabase/schema.sql
  accounts: [["npi"], ["email"], ["doximity_id"]],
  profiles: [["npi"]],
  sessions: [["token_hash"]],
  login_links: [["token_hash"]],
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
  };
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
  return { async lookup(npi) { return fixture[npi] || null; } };
}

// Listings: npi -> { name, procedures: [...], urls: [...] } (the finder's own data, or a fixture).
export function staticListings(map) {
  return { async get(npi) { return map[npi] || null; } };
}
export function listingsFromFinder(byProc) {        // { ufe: {people:[...]}, ... } as in site/data/<proc>.json
  const map = {};
  for (const [proc, d] of Object.entries(byProc)) for (const p of d.people || []) {
    const m = (map[p.npi] ||= { name: p.name, procedures: [], urls: [] });
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

export function localBackend({ nppes = {}, listings = {}, doximity = false } = {}) {
  return {
    kind: "local",
    data: localData(), photos: localPhotos(), email: localEmail(), identity: localIdentity(),
    nppes: localNppes(nppes), listings: staticListings(listings), doximity: doximity ? localDoximity() : null,
  };
}
