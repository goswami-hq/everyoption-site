// Once accounts are connected: writes confirmed.json (for ai-hq scripts/every_option_export.py --confirmed) and copies
// each confirmed doctor's photo into site/photos/<npi>-<id>.<ext>, so the public site stays static.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/export-confirmed.mjs OUT.json
// The key comes from the environment (his keychain or the Pages settings), never from the repo.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportConfirmed } from "../lib/accounts/service.mjs";
import { supabaseData, supabasePhotos } from "../lib/accounts/supabase.mjs";

export async function writeConfirmed(backend, outFile, photoDir) {
  const list = await exportConfirmed(backend);
  mkdirSync(photoDir, { recursive: true });
  for (const c of list) {
    const m = /^(\d{10})\/([0-9a-f]{8,32})\.(jpg|png|webp)$/.exec(c.photo || "");
    if (!m) { c.photo = ""; continue; }
    const f = await backend.photos.get(c.photo);
    if (!f) { c.photo = ""; continue; }
    writeFileSync(path.join(photoDir, `${m[1]}-${m[2]}.${m[3]}`), f.bytes);
  }
  writeFileSync(outFile, JSON.stringify(list, null, 1));
  return list;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { SUPABASE_URL: u, SUPABASE_SERVICE_ROLE_KEY: k } = process.env;
  if (!u || !k) { console.error("accounts not connected: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(2); }
  const out = process.argv[2] || "confirmed.json";
  const site = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "site", "photos");
  const list = await writeConfirmed({ data: supabaseData(u, k), photos: supabasePhotos(u, k) }, out, site);
  console.log(`${list.length} confirmed doctors -> ${out}`);
}
