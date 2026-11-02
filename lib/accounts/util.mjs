// Shared helpers for physician accounts. No vendor code here.
import { npiOk } from "../../functions/api/claim.js";

export { npiOk };
export const PROCS = ["ufe", "pae", "gae"];

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normEmail = (s) => String(s || "").trim().toLowerCase();

// Names: lower case, no accents, no punctuation, no titles or suffixes.
const DROP = new Set(["dr", "md", "do", "mbbs", "phd", "jr", "sr", "ii", "iii", "iv", "facr", "fsir", "mph", "ms", "mba"]);
export function nameParts(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter((w) => w && !DROP.has(w));
}

// Same person by name: last names equal, and first names equal or one a prefix of the other (Kate / Katherine is not
// matched; that goes to the exceptions list for a person to look at).
export function sameName(a, b) {
  const A = typeof a === "string" ? split(a) : a, B = typeof b === "string" ? split(b) : b;
  if (!A.first || !B.first || !A.last || !B.last) return false;
  const lastOk = A.last === B.last || A.lastAll.includes(B.last) || B.lastAll.includes(A.last);
  const f1 = A.first, f2 = B.first;
  const firstOk = f1 === f2 || (f1.length >= 3 && f2.startsWith(f1)) || (f2.length >= 3 && f1.startsWith(f2));
  return lastOk && firstOk;
}
function split(full) {
  const p = nameParts(full);
  return { first: p[0] || "", last: p[p.length - 1] || "", lastAll: p.slice(1) };
}
export function nameFrom(first, last) {
  const f = nameParts(first), l = nameParts(last);
  return { first: f[0] || "", last: l[l.length - 1] || "", lastAll: l };
}

// Registrable domain, close enough for US practice sites (two labels; three under a two-letter country second level).
export function baseDomain(host) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (h.length <= 2) return h.join(".");
  const two = h.slice(-2).join(".");
  if (/^(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(two)) return h.slice(-3).join(".");
  return two;
}

export const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

export class Fail extends Error {
  constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
