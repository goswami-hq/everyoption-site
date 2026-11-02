// Test helpers: a fake browser (cookie jar) talking to the accounts handler with the local stand-ins.
import { readFileSync } from "node:fs";
import { localBackend } from "../lib/accounts/local.mjs";
import { handle } from "../lib/accounts/http.mjs";
import { makeService } from "../lib/accounts/service.mjs";

export const FIX = JSON.parse(readFileSync(new URL("./fixtures/accounts.json", import.meta.url)));
export const ANN = "1999000015", BEN = "1999000023", CARA = "1999000031", DAN = "1999000049", EVE = "1999000056",
  ORG = "1999000064", GIL = "1999000072";
export const EMAIL = { [ANN]: "ann@home.example", [BEN]: "ben@home.example", [CARA]: "cara@home.example", [GIL]: "gil@home.example" };

export function world(opts = {}) {
  const backend = localBackend({ nppes: FIX.nppes, listings: FIX.listings, radiologists: FIX.radiologists, doximity: !!opts.doximity, geocodes: FIX.geocodes });
  const clock = { t: Date.parse("2026-11-01T12:00:00Z") };
  const env = { backend, now: () => clock.t, origin: "http://localhost:8787", ...opts.env };
  const w = { backend, clock, env, outbox: backend.email.outbox, svc: () => makeService(backend, env) };
  w.client = (ip = "10.0.0.1") => {
    const jar = {};
    const c = {
      jar,
      async call(method, path, body, extra = {}) {
        const headers = { "CF-Connecting-IP": ip, Origin: env.origin, ...(extra.headers || {}) };
        if (Object.keys(jar).length) headers.Cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
        let payload;
        if (body instanceof Uint8Array) payload = body;
        else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] ||= "application/json"; }
        const r = await handle(new Request(env.origin + "/api/account/" + path, { method, headers, body: payload }), env);
        for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(";"); const [k, v] = kv.split("="); if (v) jar[k] = v; else delete jar[k]; }
        let j = null; try { j = await r.json(); } catch (_) {}
        return { status: r.status, body: j, headers: r.headers };
      },
      get: (p) => c.call("GET", p),
      post: (p, b, x) => c.call("POST", p, b ?? {}, x),
      put: (p, b) => c.call("PUT", p, b),
    };
    return c;
  };
  w.lastCode = (to) => {
    const m = [...w.outbox].reverse().find((e) => (!to || e.to === to) && /is your Every Option code/.test(e.subject));
    const x = m && /Your Every Option code is (\d{6})\./.exec(m.text);
    return x ? x[1] : null;
  };
  // Sign up (or sign in) with a code; returns the client.
  w.signIn = async (npi = ANN, email = EMAIL[npi] || "x@home.example", ip, procedures = []) => {
    const c = w.client(ip);
    const s = await c.post("signup", { npi, email, agree: true, procedures });
    if (s.status !== 202 || !s.body.challenge) throw new Error("sign-up failed " + JSON.stringify(s.body));
    const r = await c.post("code", { challenge: s.body.challenge, code: w.lastCode(email) });
    if (r.status !== 200) throw new Error("code failed " + JSON.stringify(r.body));
    return c;
  };
  // Full access through the (simulated) ID check, with the NPPES name.
  w.idCheck = async (c, first, last) => {
    const s = await c.post("check/identity");
    if (s.status !== 200) throw new Error("id check failed " + JSON.stringify(s.body));
    const sess = new URL(s.body.url, "http://x").searchParams.get("session");
    const me = (await c.get("me")).body.account;
    const n = FIX.nppes[me.npi || me.claim_npi];
    const r = await w.svc().identityResult({ session: sess, status: "verified", first: first ?? n.first, last: last ?? n.last });
    return r;
  };
  w.full = async (npi = ANN, email, procedures = ["ufe"]) => {
    const c = await w.signIn(npi, email, undefined, procedures);
    await w.idCheck(c);
    return c;
  };
  w.invite = async (npi, kind = "owner", extra = {}) => {
    const r = await w.svc().createInvite({ kind, npi, ...extra });
    return /#invite=([0-9a-f]{64})$/.exec(r.url)[1];
  };
  return w;
}
