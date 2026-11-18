// Job platform-web-design-0018 (his words, HQ chat 2026-11-16 18:57 CT: "B now, just MD, DO, MBBS, MD PhD (any others
// you can think of?)"; his go 19:07 CT with MBChB, DO PhD, MD MPH and MD MBA added). A doctor with an account picks a
// degree from a fixed list and may set a "goes by" first name. The last name always comes from the NPI Registry.
// Shown everywhere a doctor's name is shown as "Goes-by Last, Degree"; the profile address never changes (it is built
// from the registry name, lib/profile-path.mjs). Browser-safe: no imports.

export const DEGREES = ["MD", "DO", "MBBS", "MBChB", "MD PhD", "DO PhD", "MD MPH", "MD MBA"];
export const GOES_BY_MAX = 30;

// The registry's credential text ("M.D.", "MD, PhD", "D.O., FSIR") as one of DEGREES, or "" when none fits.
// Letters outside the list (fellowships, other degrees) are dropped.
export function registryDegree(credential) {
  const toks = String(credential || "").toUpperCase().replace(/\./g, "").split(/[\s,;/&+]+/).filter(Boolean);
  const has = (t) => toks.includes(t);
  const base = has("MD") ? "MD" : has("DO") ? "DO" : has("MBBS") ? "MBBS" : has("MBCHB") ? "MBChB" : "";
  if (!base) return "";
  for (const extra of ["PHD", "MPH", "MBA"]) {
    const d = `${base} ${extra === "PHD" ? "PhD" : extra}`;
    if (has(extra) && DEGREES.includes(d)) return d;
  }
  return base;
}

// What a doctor may save. Degree: "" (as in the NPI Registry) or one of DEGREES. Goes-by: "" (the registry first name)
// or 1 to 30 letters, spaces, hyphens and apostrophes. null: refused.
export function cleanDegree(v) {
  if (v === "") return "";
  return typeof v === "string" && DEGREES.includes(v) ? v : null;
}
export function cleanGoesBy(v) {
  if (typeof v !== "string") return null;
  const s = v.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length > GOES_BY_MAX || !/^\p{L}[\p{L}\p{M} '\-]*$/u.test(s) || /['\-]$/.test(s)) return null;
  return s;
}

// Registry names often come in capitals ("JANE"). A word all in capitals or all in small letters is put in title case;
// a mixed-case word (McDonald, DeAngelis) is left as is.
export function nameCase(s) {
  return String(s || "").split(/(\s+|-|')/).map((w) => (w && /\p{L}/u.test(w) && (w === w.toUpperCase() || w === w.toLowerCase())
    ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w)).join("");
}

// The degree shown: the doctor's pick, or the registry's.
export function shownDegree(degree, credential) { return cleanDegree(degree || "") || registryDegree(credential); }

// "Goes-by Last, Degree". first, last: the registry name; goes_by, degree: the doctor's; credential: the registry's.
export function displayName({ first = "", last = "", goes_by = "", degree = "", credential = "" } = {}) {
  const f = cleanGoesBy(goes_by || "") || nameCase(first);
  const n = [f, nameCase(last)].filter(Boolean).join(" ");
  const d = shownDegree(degree, credential);
  return n && d ? `${n}, ${d}` : n;
}

// Item 8: "Listed in the NPI Registry as <first, middle initial if any, last>", only when a goes-by name is set and
// differs from the registry first name. Reviewer round 1: the registry is defined in place for patients.
export function registryLine({ first = "", middle = "", last = "", goes_by = "" } = {}) {
  const gb = cleanGoesBy(goes_by || "");
  if (!gb || gb.toLowerCase() === String(first || "").trim().toLowerCase()) return "";   // same as the registry: no line
  const m = String(middle || "").trim();
  const n = [nameCase(first), m ? m.charAt(0).toUpperCase() + "." : "", nameCase(last)].filter(Boolean).join(" ");
  return n ? `Listed in the NPI Registry (the national list of U.S. health care providers) as ${n}` : "";
}
