// Local preview only: serves site/ like Cloudflare Pages (site/_redirects included) and runs functions/api/report.js
// against an in-memory KV.
//   node tools/dev-server.mjs [port] [--no-kv] [--accounts [--doximity]]      (no install; Node 18+)
// Accounts (jobs 10 and 11): off by default, so /api/account/* answers 503 "not open yet", as on the dev site. With
// --accounts it runs lib/accounts/ against the local stand-ins and the made-up people in tools/fixtures/accounts.json:
// email lands in /__outbox, the ID check and Doximity are simulated pages (/__identity/, /__doximity/), and
// /__accounts shows the stored rows. Nothing leaves this machine.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { onRequestPost } from "../functions/api/report.js";
import { handle } from "../lib/accounts/http.mjs";
import { handlePublic } from "../lib/accounts/listings.mjs";
import { handleDoctor } from "../lib/directory.mjs";
import { localBackend } from "../lib/accounts/local.mjs";
import { exportConfirmed, makeService } from "../lib/accounts/service.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "site");
const port = +process.argv.find((a) => /^\d+$/.test(a)) || 8787;
const noKV = process.argv.includes("--no-kv");
const withAccounts = process.argv.includes("--accounts");
const FIX = JSON.parse(readFileSync(path.join(HERE, "fixtures", "accounts.json"), "utf8"));
const backend = withAccounts ? localBackend({ nppes: FIX.nppes, listings: FIX.listings, radiologists: FIX.radiologists, doximity: process.argv.includes("--doximity"), geocodes: FIX.geocodes }) : null;
const origin = `http://localhost:${port}`;
const slowArg = process.argv.find((a) => a.startsWith("--listings-slow="));
const SLOW = slowArg ? +slowArg.split("=")[1] : 0, DOWN = process.argv.includes("--listings-down");
const listingsDB = (b) => ({ ...b, data: { ...b.data, overlay: async () => {
  if (SLOW) await new Promise((r) => setTimeout(r, SLOW));
  if (DOWN) throw new Error("database down");
  return b.data.overlay();
} } });
const localAssets = { async fetch(req) {
  const p = path.join(ROOT, new URL(req.url).pathname);
  try { return new Response(await readFile(p), { status: 200 }); } catch (_) { return new Response("", { status: 404 }); }
} };
const REDIRECTS = new Map(readFileSync(path.join(ROOT, "_redirects"), "utf8").split("\n")
  .map((l) => l.trim().split(/\s+/)).filter((w) => w.length >= 2 && !w[0].startsWith("#")).map((w) => [w[0], [w[1], +(w[2] || 302)]]));
const store = new Map();
export const kv = {
  async get(k) { const v = store.get(k); return v && (!v.exp || v.exp > Date.now()) ? v.val : null; },
  async put(k, val, o = {}) { store.set(k, { val, exp: o.expirationTtl ? Date.now() + o.expirationTtl * 1000 : 0 }); },
};
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const TEST_EMAIL = /^agoswami\.assistant\+eo21-[0-9a-z]{4,20}@gmail\.com$/;
function testOp(op, npi) {
  if (!/^\d{10}$/.test(npi)) return { error: "npi" };
  const T = backend.data.tables, rows = (n) => T.get(n) || [];
  const ids = new Set(rows("accounts").filter((a) => a.npi === npi || a.claim_npi === npi || a.lost_npi === npi || TEST_EMAIL.test(a.email || "")).map((a) => a.id));
  const emails = new Set(rows("accounts").filter((a) => ids.has(a.id) && a.email).map((a) => a.email));
  const mine = (r) => ids.has(r.account_id) || r.npi === npi || ids.has(r.id) || ids.has(r.inviter_account_id) || ids.has(r.used_by)
    || emails.has(r.email) || TEST_EMAIL.test(r.email || "");
  if (op === "promote") {
    const a = rows("accounts").filter((x) => x.npi === npi && TEST_EMAIL.test(x.email || ""));
    a.forEach((x) => { x.level = "full"; });
    return { promoted: a.length };
  }
  const counts = {};
  for (const [name, list] of T) {
    if (name === "radiologist_names") continue;
    counts[name] = list.filter(mine).length;
    if (op === "reset") T.set(name, list.filter((r) => !mine(r)));
  }
  return op === "reset" ? { deleted: counts } : { remaining: counts };
}

async function toRequest(req, url) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
  // Job 31: local only. A browser test may name a made-up address per window (X-Test-IP, documentation ranges), so
  // many made-up doctors can sign up under the 3-an-hour limit per connection. Cloudflare sets the real header.
  const testIp = /^(203\.0\.113|198\.51\.100|192\.0\.2)\.\d{1,3}$/.test(String(req.headers["x-test-ip"] || "")) ? req.headers["x-test-ip"] : "";
  headers.delete("x-test-ip");
  headers.set("CF-Connecting-IP", testIp || req.socket.remoteAddress || "127.0.0.1");
  return new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
}
async function send(res, r) {
  const h = {}; r.headers.forEach((v, k) => { if (k !== "set-cookie") h[k] = v; });
  const sc = r.headers.getSetCookie(); if (sc.length) h["set-cookie"] = sc;
  res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
}
const page = (res, body) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(`<!doctype html><meta charset="utf-8"><title>Local stand-in</title><body style="font:18px system-ui;max-width:40em;margin:40px auto">${body}`); };
const asJSON = (res, x) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(x, null, 1)); };

http.createServer(async (req, res) => {
  // A path such as "//" is not a valid relative URL; read it as a path, so one odd request cannot stop the server.
  const url = new URL(req.url.replace(/^\/+/, "/"), origin);
  // site/_redirects, exact paths only (all this site uses). The query string is kept, as the site expects of Cloudflare
  // (not proven live: the dev site is behind Access; check /claim/?npi=... there).
  const hop = REDIRECTS.get(url.pathname);
  if (hop) { res.writeHead(hop[1], { Location: hop[0] + url.search }); res.end(); return; }
  if (url.pathname === "/api/report") {
    const request = await toRequest(req, url);
    const r = req.method === "POST" ? await onRequestPost({ request, env: noKV ? {} : { CLAIMS: kv } })
      : new Response('{"error":"method"}', { status: 405 });
    await send(res, r);
    if (url.searchParams.has("dump")) console.log([...store.keys()]);
    return;
  }
  if (url.pathname.startsWith("/api/account/")) return send(res, await handle(await toRequest(req, url), { backend, origin }));
  // Job 25: the live overlay and public photos. --listings-slow=<ms> and --listings-down play a slow or failed database.
  if (url.pathname === "/api/listings" || url.pathname.startsWith("/api/photo/")) return send(res, await handlePublic(await toRequest(req, url), {
    backend: backend && listingsDB(backend), origin, noCache: true, ASSETS: localAssets }));
  // Job 27: doctor profiles, the same handler as functions/doctors/[[path]].js.
  if (url.pathname.startsWith("/doctors/")) {
    const r = await handleDoctor(await toRequest(req, url), { backend: backend ? listingsDB(backend) : null, noCache: true, ASSETS: localAssets });
    if (r) return send(res, r);
  }
  if (backend && url.pathname === "/__alerts") return asJSON(res, backend.alert.sent);
  if (backend && url.pathname === "/__outbox") return asJSON(res, backend.email.outbox);
  if (backend && url.pathname === "/__accounts") return asJSON(res, Object.fromEntries(backend.data.tables));
  if (backend && url.pathname === "/__confirmed") return asJSON(res, await exportConfirmed(backend));
  // Stand-ins for his two local commands (tools/invite.mjs, tools/revoke-inviter.mjs --dev).
  if (backend && url.pathname === "/__invite") {
    const q = url.searchParams;
    try { return asJSON(res, await makeService(backend, { origin }).createInvite({ kind: q.get("kind") || "owner", npi: q.get("npi"), email: q.get("email") || "" })); }
    catch (e) { return asJSON(res, { error: e.code || e.message }); }
  }
  if (backend && url.pathname === "/__revoke") {
    try { return asJSON(res, await makeService(backend, { origin }).revokeInviter(url.searchParams.get("who"))); }
    catch (e) { return asJSON(res, { error: e.code || e.message, ...(e.extra || {}) }); }
  }
  if (backend && url.pathname === "/__identity/") {        // stands in for the identity provider's hosted page
    const s = url.searchParams.get("session"), back = url.searchParams.get("return") || "/account/";
    const btn = (label, q) => `<p><a href="/__identity/done?session=${encodeURIComponent(s)}&${q}&return=${encodeURIComponent(back)}">${label}</a></p>`;
    return page(res, `<h1>Identity check (local stand-in)</h1><p>No ID or selfie is taken here.</p>` +
      btn("Pass, name matches", "status=verified&match=1") + btn("Pass, different name", "status=verified&first=Someone&last=Different") + btn("Fail", "status=failed"));
  }
  if (backend && url.pathname === "/__identity/done") {
    const s = url.searchParams.get("session"), q = url.searchParams;
    const row = (backend.data.tables.get("identity_checks") || []).find((r) => r.provider_session === s);
    const acct = row && (backend.data.tables.get("accounts") || []).find((a) => a.id === row.account_id);
    const [first, last] = q.get("match") && acct ? [acct.first_name, acct.last_name] : [q.get("first") || "", q.get("last") || ""];
    await handle(new Request(origin + "/api/account/identity/result", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: s, status: q.get("status"), first, last }) }), { backend, origin });
    res.writeHead(302, { Location: q.get("return") || "/account/" }); res.end(); return;
  }
  if (backend && backend.doximity && url.pathname === "/__doximity/") {   // stands in for Doximity's sign-in page
    const st = url.searchParams.get("state");
    if (url.searchParams.get("first")) {
      const code = backend.doximity.grant({ id: url.searchParams.get("id") || "dx-local", first: url.searchParams.get("first"),
        last: url.searchParams.get("last"), credentials: "MD", specialty: url.searchParams.get("specialty") || "Radiology" });
      res.writeHead(302, { Location: `/api/account/doximity/callback?code=${code}&state=${encodeURIComponent(st)}` }); res.end(); return;
    }
    return page(res, `<h1>Doximity (local stand-in)</h1><form><input type="hidden" name="state" value="${esc(st)}">` +
      `<p><label>First <input name="first"></label> <label>Last <input name="last"></label> <label>Id <input name="id" value="dx-local"></label></p><button>Continue</button></form>`);
  }
  // Job 21: stand-ins for the test-only database functions (ai-hq projects/platform/accounts/job21/test-reset.sql), so
  // the live test's flow runs here first. Same rule: only one NPI (?npi=) and the test email pattern.
  if (backend && url.pathname.startsWith("/__test/")) return asJSON(res, testOp(url.pathname.slice(8), url.searchParams.get("npi") || ""));
  if (url.pathname === "/__store") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify([...store.entries()].map(([k, v]) => [k, v.val]))); return; }
  let p = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(400); res.end(); return; }
  try { if ((await stat(p)).isDirectory()) p = path.join(p, "index.html"); } catch { p = path.join(ROOT, "404.html"); res.statusCode = 404; }
  try {
    let data = await readFile(p);
    const type = TYPES[path.extname(p)] || "application/octet-stream";
    const gz = /gzip/.test(req.headers["accept-encoding"] || "") && /text|json|javascript|css/.test(type);
    if (gz) data = zlib.gzipSync(data);
    res.setHeader("Content-Type", type); if (gz) res.setHeader("Content-Encoding", "gzip");
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(port, "127.0.0.1", () => console.log(`${origin}${noKV ? " (no KV: form answers 503)" : ""}${backend ? " (accounts: local stand-ins, made-up people)" : " (accounts not open)"}`));
