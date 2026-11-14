// His invitations (full access, unlimited) and published-email invitations, from the command line. Prints the link;
// sends nothing (outreach to a published email goes through his email gate in ai-hq first).
//   node tools/invite.mjs <NPI>                                  his invitation
//   node tools/invite.mjs <NPI> --published <email>              basic, to an address printed on the doctor's own page
//   ... --dev http://localhost:8792                              against the local dev server (made-up people)
// Real database: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never in the repo); EO_ORIGIN for the
// link (default https://everyoptionmd.com).
import { makeService } from "../lib/accounts/service.mjs";
import { supabaseData, supabaseRadiologists } from "../lib/accounts/supabase.mjs";
import { nppesRegistry } from "../lib/accounts/vendors.mjs";

export function realBackend(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const none = { async send() { throw new Error("no email from the command line"); } };
  return { data: supabaseData(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY), nppes: nppesRegistry(), email: none,
    listings: { async get() { return null; } }, radiologists: supabaseRadiologists(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) };
}

async function main(argv) {
  const npi = argv.find((a) => /^\d{10}$/.test(a));
  const pi = argv.indexOf("--published"), di = argv.indexOf("--dev");
  const email = pi >= 0 ? argv[pi + 1] : "";
  if (!npi || (pi >= 0 && !email)) { console.error("usage: node tools/invite.mjs <NPI> [--published <email>] [--dev <url>]"); return 2; }
  const kind = pi >= 0 ? "published" : "owner";
  let r;
  if (di >= 0) {
    const res = await fetch(`${argv[di + 1]}/__invite?npi=${npi}&kind=${kind}&email=${encodeURIComponent(email)}`);
    r = await res.json();
  } else {
    const b = realBackend();
    if (!b) { console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or use --dev <url>."); return 2; }
    try { r = await makeService(b, { origin: process.env.EO_ORIGIN || "https://everyoptionmd.com" }).createInvite({ kind, npi, email }); }
    catch (e) { r = { error: e.code || e.message }; }
  }
  if (!r.ok) { console.error("not made:", r.error); return 1; }
  console.log(`${kind === "owner" ? "Full-access" : "Basic"} invitation for ${r.name} (NPI ${r.npi}), good once until ${r.expires_at}:`);
  if (r.held) console.log("Note: this NPI already has an account. Using this link moves the listing to whoever opens it.");
  console.log(r.url);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).then((c) => process.exit(c));
