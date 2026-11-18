// Job platform-directory-0007: made-up accounts for the video visits screenshots and browser checks. Confirmed is empty
// until invitations or proof, so this seeds it: five full-access doctors around New York (two offer video visits, one
// in New Jersey only, one said no, one never answered, one licensed in 30 states with a long practice name) and one
// partial account that said yes (must not show). Local only; nothing leaves this machine.
//   node tools/dev-server.mjs 8797 --accounts --seed=tools/e2e/telehealth_seed.mjs      cookies: /__seed
import { world, ANN, BEN, CARA, GIL, EMAIL } from "../accounts-helpers.mjs";

const HAL = "1999000106", ALEK = "1999000114";
const THIRTY = ["AL", "AZ", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "IL", "IN", "KY", "MD", "MA", "MI", "MN", "MO", "NH", "NJ", "NY",
  "NC", "OH", "PA", "RI", "SC", "TN", "TX", "VT", "VA", "WI"];
const office = (practice, street, city, state, zip, phone) => ({ practice, street, city, state, zip, phone });
export const PEOPLE = [
  { npi: ANN, full: true, off: office("Midtown Vascular and Interventional", "315 E 34th St", "New York", "NY", "10016", "2125550101"),
    tele: { offers: true, states: ["NY", "NJ"] }, book: "https://midtown-ir.example/" },
  { npi: BEN, full: true, off: office("Hudson IR", "50 Washington St", "Hoboken", "NJ", "07030", "2015550102"), tele: { offers: true, states: ["NJ"] } },
  { npi: CARA, full: true, off: office("Brooklyn Heights Imaging", "100 Court St", "Brooklyn", "NY", "11201", "7185550103"), tele: { offers: false, states: [] } },
  { npi: GIL, full: true, off: office("Bronx Vein and IR", "1500 Pelham Pkwy", "Bronx", "NY", "10461", "7185550104"), tele: null },
  { npi: ALEK, full: true, off: office("The Comprehensive Interventional Radiology and Minimally Invasive Vascular Institute of Greater Manhattan",
    "12 E 14th St", "New York", "NY", "10003", "2125550105"), tele: { offers: true, states: THIRTY } },
  { npi: HAL, full: false, off: office("Upper West IR", "200 W 90th St", "New York", "NY", "10024", "2125550106"), tele: { offers: true, states: ["NY"] } },
];

export async function seed() {
  const w = world(), cookies = {};
  for (const p of PEOPLE) {
    const c = await w.signIn(p.npi, EMAIL[p.npi] || `${p.npi}@home.example`, `10.70.0.${PEOPLE.indexOf(p) + 1}`, ["ufe"]);
    if (p.full) await w.idCheck(c);
    const body = { offices: [p.off], insurances: ["Aetna", "Medicare"], blurbs: { ufe: "I perform UFE and see new patients within two weeks." } };
    if (p.book) body.booking_url = p.book;
    if (p.tele) body.telehealth = p.tele;
    const r = await c.put("profile", body);
    if (r.status !== 200) throw new Error(`seed ${p.npi}: ${JSON.stringify(r.body)}`);
    cookies[p.npi] = c.jar.eo_session;
  }
  return { backend: w.backend, env: w.env, cookies };
}
