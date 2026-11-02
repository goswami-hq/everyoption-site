// Test helpers: a fake browser (cookie jar) talking to the accounts handler with the local stand-ins.
import { readFileSync } from "node:fs";
import { localBackend } from "../lib/accounts/local.mjs";
import { handle } from "../lib/accounts/http.mjs";

export const FIX = JSON.parse(readFileSync(new URL("./fixtures/accounts.json", import.meta.url)));
export const ANN = "1999000015", BEN = "1999000023", CARA = "1999000031", DAN = "1999000049", EVE = "1999000056",
  ORG = "1999000064", GIL = "1999000072";

export function world(opts = {}) {
  const backend = localBackend({ nppes: FIX.nppes, listings: FIX.listings, doximity: !!opts.doximity });
  const clock = { t: Date.parse("2026-11-01T12:00:00Z") };
  const env = { backend, now: () => clock.t, origin: "http://localhost:8787", ...opts.env };
  const w = { backend, clock, env, outbox: backend.email.outbox };
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
        const sc = r.headers.get("Set-Cookie");
        if (sc) { const [kv] = sc.split(";"); const [k, v] = kv.split("="); if (v) jar[k] = v; else delete jar[k]; }
        let j = null; try { j = await r.json(); } catch (_) {}
        return { status: r.status, body: j, headers: r.headers };
      },
      get: (p) => c.call("GET", p),
      post: (p, b, x) => c.call("POST", p, b ?? {}, x),
      put: (p, b) => c.call("PUT", p, b),
    };
    return c;
  };
  w.lastLink = (to) => {
    const m = [...w.outbox].reverse().find((e) => !to || e.to === to);
    const tok = m && /#(?:link|check)=([0-9a-f]{64})/.exec(m.text);
    return tok ? tok[1] : null;
  };
  // Sign up and sign in; returns the client.
  w.signIn = async (npi = ANN, email = "ann@lakesideir.example", ip) => {
    const c = w.client(ip);
    await c.post("signup", { npi, email, accept_terms: true, name: opts.name });
    const r = await c.post("link", { token: w.lastLink(email) });
    if (r.status !== 200) throw new Error("sign-in failed " + JSON.stringify(r.body));
    return c;
  };
  w.verifyByEmail = async (c, work = "ann@lakesideir.example") => {
    await c.post("check/email", { work_email: work });
    return c.post("link", { token: w.lastLink(work) });
  };
  return w;
}
