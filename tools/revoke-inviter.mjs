// His one-step revoke of a bad inviter: it and everyone whose full access came through its invitations drop to basic,
// their unused invitations stop working, and none of them can invite again. Someone downstream with their own ID or
// Doximity proof keeps full access. Edits stay on record and undoable; contact fields leave the cards at the next export.
//   node tools/revoke-inviter.mjs <NPI or account id> [--dev http://localhost:8792]
// Real database: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
import { makeService } from "../lib/accounts/service.mjs";
import { realBackend } from "./invite.mjs";

async function main(argv) {
  const who = argv.find((a) => !a.startsWith("--") && !/^https?:/.test(a));
  const di = argv.indexOf("--dev");
  if (!who) { console.error("usage: node tools/revoke-inviter.mjs <NPI or account id> [--dev <url>]"); return 2; }
  let r;
  if (di >= 0) r = await (await fetch(`${argv[di + 1]}/__revoke?who=${encodeURIComponent(who)}`)).json();
  else {
    const b = realBackend();
    if (!b) { console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or use --dev <url>."); return 2; }
    try { r = await makeService(b, {}).revokeInviter(who); } catch (e) { r = { error: e.code || e.message, ...(e.extra || {}) }; }
  }
  if (!r.ok) {
    console.error("not revoked:", r.error);
    for (const c of r.candidates || []) console.error(`  ${c.id}  ${c.name}  ${c.holds ? "holds the NPI" : "lost the NPI"}  ${c.level}/${c.proof}  made ${c.created_at}`);
    if (r.candidates) console.error("Run again with the bad inviter's account id.");
    return 1;
  }
  console.log(`Revoked: ${r.revoked.length} account(s) lost full access (the inviter and everyone downstream).`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).then((c) => process.exit(c));
