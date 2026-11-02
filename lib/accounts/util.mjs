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
  const words = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
  // Review round 1 (job 11): titles and suffixes go, but never a field's only part (Do is a surname).
  const kept = words.filter((w) => !DROP.has(w));
  return kept.length ? kept : words;
}

// Same person by name (plan revision 2026-11-01): last name exact (all its parts, accents, case and punctuation
// ignored); first name equal, or one starts the other (Gil / Gilberto). Both sides are separate first and last fields
// (NPPES, the ID, Doximity). Returns "exact", "prefix" or "".
export function nameKey(first, last) {
  const f = nameParts(first), l = nameParts(last);
  return { first: f[0] || "", last: l.join("") };
}
export function nameMatch(a, b) {           // a, b: { first, last }
  const A = nameKey(a.first, a.last), B = nameKey(b.first, b.last);
  if (!A.first || !B.first || !A.last || !B.last || A.last !== B.last) return "";
  if (A.first === B.first) return "exact";
  const [s, l] = A.first.length <= B.first.length ? [A.first, B.first] : [B.first, A.first];
  return s.length >= 2 && l.startsWith(s) ? "prefix" : "";
}
export const sameName = (a, b) => nameMatch(a, b) !== "";
// The key the national radiologist list is counted by: last name plus first initial (stricter than the name rule, so
// "unique" also covers Ann / Annabel).
export const radiologistKey = (first, last) => { const k = nameKey(first, last); return k.last && k.first ? `${k.last}|${k.first[0]}` : ""; };

// A 6-digit sign-in code, uniform (rejection sampling).
export function sixDigits() {
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 4294000000);
  return String(a[0] % 1000000).padStart(6, "0");
}

export const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

export class Fail extends Error {
  constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
