// The profile address on the server side: a doctor's page is /doctors/<slug of name>-<NPI>/.
// Job platform-web-design-0008: the build writes this address into every list record as "path" (tools/directory.py
// path() and stamp_paths(), the source for every card); this copy serves only what the build never saw: a doctor who
// joined after the build (the listings overlay) and the profile page's own redirect check. tools/profile-links.test.mjs
// checks the two agree on every name and that no browser script builds the address itself.
export function slug(name) {
  return String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "doctor";
}
export const profilePath = (name, npi) => `/doctors/${slug(name)}-${npi}/`;
// A card's link: the address the build wrote, else (overlay-only doctors) the same rule here.
export const profileHref = (p) => (p && p.path) || profilePath(p.name, p.npi);
