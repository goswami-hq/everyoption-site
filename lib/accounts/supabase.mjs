// Supabase secret keys (sb_secret_...) go in the apikey header only; they are not JWTs. Supabase docs, read 2026-11-02.
// The variable keeps the name SUPABASE_SERVICE_ROLE_KEY; it holds the secret key.
// Supabase adapter: the data and photo interfaces over Supabase's REST (PostgREST) and Storage APIs, with the
// service-role key, server side only (Pages Function). Tables, row rules and the two functions it calls are in
// supabase/schema.sql. The browser never talks to Supabase and never holds a Supabase key.
import { Fail } from "./util.mjs";

const enc = (v) => encodeURIComponent(v);
function filters(match) {
  return Object.entries(match).map(([k, v]) => `${enc(k)}=${v === null ? "is.null" : "eq." + enc(String(v))}`).join("&");
}

export function supabaseData(base, key, fetchFn = (...a) => fetch(...a)) {
  const root = base.replace(/\/$/, "") + "/rest/v1/";
  const H = { apikey: key, "Content-Type": "application/json" };
  async function call(method, path, body, prefer, signal) {
    const r = await fetchFn(root + path, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal });
    if (r.status === 409) throw new Fail(409, "conflict");
    if (!r.ok) throw new Error(`supabase ${method} ${path.split("?")[0]} ${r.status}`);   // no row content in errors
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  return {
    async insert(table, row) { const { id, ...rest } = row; return (await call("POST", table, rest, "return=representation"))[0]; },
    async one(table, match) { return (await call("GET", `${table}?select=*&${filters(match)}&limit=1`))[0] || null; },
    async many(table, match = {}) { const f = filters(match); return call("GET", `${table}?select=*${f ? "&" + f : ""}&order=id`); },
    async update(table, match, patch) { return call("PATCH", `${table}?${filters(match)}`, patch, "return=representation"); },
    async hit(key, windowSec, max) { return call("POST", "rpc/eo_hit", { p_key: key, p_window: windowSec, p_max: max }); },
    async consumeLink(tokenHash) { const r = await call("POST", "rpc/eo_consume_link", { p_hash: tokenHash }); return (Array.isArray(r) ? r[0] : r) || null; },
    async tryCode(challengeHash, codeHash, maxTries) {
      const r = await call("POST", "rpc/eo_try_code", { p_challenge: challengeHash, p_code: codeHash, p_max: maxTries });
      return (Array.isArray(r) ? r[0] : r) || null;
    },
    // Job 25: the public overlay in one request (PostgREST embeds profiles -> accounts -> attestations along the
    // foreign keys in schema.sql). Each row: the profile, its holder account, and the procedures that holder attested.
    // Supabase returns at most 1,000 rows a request and cuts silently, so this reads pages of 1,000 until a short one.
    async overlay() {
      const signal = AbortSignal.timeout(2000), rows = [];
      for (let off = 0; off < 50000; off += 1000) {
        const page = await call("GET", "profiles?select=npi,attested,offices,booking_url,insurances,insurance_other," +
          `insurance_confirm,blurbs,photo_key,accounts(id,npi,level,name,attestations(npi,procedure))&order=npi&limit=1000&offset=${off}`,
          undefined, undefined, signal);
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows.map(({ accounts: a, ...r }) => ({ ...r, account: a ? { id: a.id, npi: a.npi, level: a.level, name: a.name } : null,
        held: ((a && a.attestations) || []).filter((x) => x.npi === r.npi).map((x) => x.procedure) }));
    },
    async publicPhoto(npi) {
      const r = (await call("GET", `profiles?select=photo_key,accounts(npi,level)&npi=eq.${enc(npi)}&limit=1`,
        undefined, undefined, AbortSignal.timeout(2000)))[0];
      return r && r.accounts && r.accounts.npi === npi ? { photo_key: r.photo_key, level: r.accounts.level } : null;
    },
    async consumeInvite(tokenHash) { const r = await call("POST", "rpc/eo_consume_invite", { p_hash: tokenHash }); return (Array.isArray(r) ? r[0] : r) || null; },
  };
}

export function supabasePhotos(base, key, fetchFn = (...a) => fetch(...a)) {
  const root = base.replace(/\/$/, "") + "/storage/v1/object/photos/";
  const H = { apikey: key };
  return {
    async put(k, bytes, type) {
      const r = await fetchFn(root + enc(k), { method: "POST", headers: { ...H, "Content-Type": type, "x-upsert": "true" }, body: bytes });
      if (!r.ok) throw new Error(`storage put ${r.status}`);
      return k;
    },
    async get(k) {
      const r = await fetchFn(root + enc(k), { headers: H });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error(`storage get ${r.status}`);
      return { bytes: new Uint8Array(await r.arrayBuffer()), type: r.headers.get("Content-Type") || "" };
    },
  };
}

// The national radiologist list (table radiologist_names, loaded by tools/load-radiologist-names.mjs).
export function supabaseRadiologists(base, key, fetchFn = (...a) => fetch(...a)) {
  const d = supabaseData(base, key, fetchFn);
  return { async lookup(k) { const r = k && await d.one("radiologist_names", { name_key: k }); return r ? { n: r.n, npi: r.npi || null } : null; } };
}
