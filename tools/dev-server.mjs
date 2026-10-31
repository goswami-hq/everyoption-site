// Local preview only: serves site/ like Cloudflare Pages and runs functions/api/claim.js against an in-memory KV.
//   node tools/dev-server.mjs [port] [--no-kv]      (no install; Node 18+)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { onRequestPost } from "../functions/api/claim.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "site");
const port = +process.argv.find((a) => /^\d+$/.test(a)) || 8787;
const noKV = process.argv.includes("--no-kv");
const store = new Map();
export const kv = {
  async get(k) { const v = store.get(k); return v && (!v.exp || v.exp > Date.now()) ? v.val : null; },
  async put(k, val, o = {}) { store.set(k, { val, exp: o.expirationTtl ? Date.now() + o.expirationTtl * 1000 : 0 }); },
};
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/api/claim") {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
    headers.set("CF-Connecting-IP", req.socket.remoteAddress || "127.0.0.1");
    const r = req.method === "POST"
      ? await onRequestPost({ request: new Request(url, { method: "POST", headers, body }), env: noKV ? {} : { CLAIMS: kv } })
      : new Response('{"error":"method"}', { status: 405 });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
    if (url.searchParams.has("dump")) console.log([...store.keys()]);
    return;
  }
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
}).listen(port, () => console.log(`http://localhost:${port}${noKV ? " (no KV: form answers 503)" : ""}`));
