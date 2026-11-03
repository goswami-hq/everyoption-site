// Shared helpers for physician accounts. No vendor code here.
import { npiOk } from "../../functions/api/report.js";
import { PROCS } from "../procedures.mjs";

export { npiOk, PROCS };

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

// Job 22: "find yourself by name". A typed name, "First Last" or "Last, First", titles dropped -> { first, last }.
export function splitName(s) {
  const raw = String(s || "").trim();
  if (raw.includes(",")) {
    const [l, f] = raw.split(",", 2);
    return { first: nameParts(f)[0] || "", last: nameParts(l).join(" ") };
  }
  const w = nameParts(raw);
  return w.length > 1 ? { first: w[0], last: w[w.length - 1] } : { first: "", last: w[0] || "" };
}
// A listed name ("Ann Testone") matches a search when its last word is the last name and, if a first name was given,
// its first word starts with it (or the reverse: Gil / Gilberto).
export function nameHit(full, q) {
  const w = nameParts(full);
  if (!w.length || !q.last || w[w.length - 1] !== nameParts(q.last).join("")) return false;
  if (!q.first) return true;
  const f = nameParts(q.first)[0] || "";
  return w[0].startsWith(f) || f.startsWith(w[0]);
}
