// Job platform-launch-0010 (his "1. Yes", HQ chat 2026-11-17 15:12 CT): made-up NPIs for the live owner-box test on the
// dev site. The real NPI Registry does not know them, so without this the account page refuses them. They are allowed
// only when every check below passes; any doubt means off (fail closed):
//   1. the request reached a Cloudflare Pages preview host (<branch or deployment>.everyoption-site.pages.dev), never
//      the custom domain or the bare production host everyoption-site.pages.dev;
//   2. SUPABASE_URL is exactly the TEST project's URL (https://<TEST_REF>.supabase.co), never production's
//      (PROD_REF; a production deployment, even at its own *.pages.dev address, carries the production URL);
//   3. the Pages branch, if Cloudflare ever names it to the Function, is not main (an extra guard only: Cloudflare is
//      thought to give CF_PAGES_* to the build, not to Functions; check 2 is what keeps production off);
//   4. the backend is the real one (tests and the local server pass their own backend and fixture registry).
// Even then a fixture answers only for the NPIs listed here, and only when the real registry knows nothing of them.
// Project refs are not secret (ai-hq ops/accounts.md).
export const TEST_REF = "emoexaaeaffltrbzckua";
export const PROD_REF = "pfwqhgmelnbggcnwpgcr";
const PREVIEW_HOST = /^[a-z0-9]([a-z0-9-]{0,62})\.everyoption-site\.pages\.dev$/;

export const PREVIEW_FIXTURES = Object.freeze({
  "1999000015": Object.freeze({ type: "NPI-1", npi: "1999000015", first: "Fixture", middle: "", last: "Alpha", credential: "MD",
    taxonomy: "2085R0204X", taxonomy_desc: "Radiology, Vascular & Interventional Radiology", taxonomies: ["2085R0204X"], city: "Chicago", state: "IL" }),
  "1999000023": Object.freeze({ type: "NPI-1", npi: "1999000023", first: "Fixture", middle: "", last: "Bravo", credential: "MD",
    taxonomy: "2085R0204X", taxonomy_desc: "Radiology, Vascular & Interventional Radiology", taxonomies: ["2085R0204X"], city: "Chicago", state: "IL" }),
});

export function fixturesOn(env, requestUrl) {
  try {
    if (!env || typeof env !== "object" || env.backend) return false;
    const req = new URL(String(requestUrl));
    if (req.protocol !== "https:" || req.port || !PREVIEW_HOST.test(req.hostname)) return false;
    if (typeof env.SUPABASE_URL !== "string") return false;
    const db = new URL(env.SUPABASE_URL);
    if (db.protocol !== "https:" || db.port || db.username || db.password || db.search || db.hash) return false;
    if (db.pathname !== "/" && db.pathname !== "") return false;
    if (db.hostname !== `${TEST_REF}.supabase.co` || db.hostname.includes(PROD_REF)) return false;
    if (env.CF_PAGES_BRANCH !== undefined && (typeof env.CF_PAGES_BRANCH !== "string" || env.CF_PAGES_BRANCH === "main")) return false;
    return true;
  } catch (_) {
    return false;
  }
}

// A copy of the fixture for one NPI, or null.
export const fixturePerson = (npi) => (Object.hasOwn(PREVIEW_FIXTURES, npi) ? { ...PREVIEW_FIXTURES[npi], taxonomies: [...PREVIEW_FIXTURES[npi].taxonomies] } : null);
