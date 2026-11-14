// Loads the national radiologist name list into Supabase (table radiologist_names), once at connect and after each
// rebuild. The list is built in ai-hq by scripts/every_option_radiologist_names.py and kept on the mini, not in git.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/load-radiologist-names.mjs ~/ai-hq-data/projects/platform/accounts/radiologist-names.json
import { readFileSync } from "node:fs";

export function rowsFrom(map) {
  return Object.entries(map).filter(([k, v]) => /^[a-z]+\|[a-z]$/.test(k) && v && Number.isInteger(v.n) && v.n > 0)
    .map(([name_key, v]) => ({ name_key, n: v.n, npi: v.n === 1 && /^\d{10}$/.test(v.npi || "") ? v.npi : null }));
}

async function main(file) {
  const { SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!file || !base || !key) { console.error("usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/load-radiologist-names.mjs FILE"); return 2; }
  const rows = rowsFrom(JSON.parse(readFileSync(file, "utf8")));
  for (let i = 0; i < rows.length; i += 1000) {
    const r = await fetch(base.replace(/\/$/, "") + "/rest/v1/radiologist_names", { method: "POST",
      headers: { apikey: key, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows.slice(i, i + 1000)) });
    if (!r.ok) { console.error("load failed at row", i, r.status); return 1; }
  }
  console.log(`loaded ${rows.length} name keys`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv[2]).then((c) => process.exit(c));
