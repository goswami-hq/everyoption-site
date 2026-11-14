// Physician accounts: the rules, written once against the small interfaces in lib/accounts/README.md.
// The same code runs with the local stand-ins (lib/accounts/local.mjs) and with Supabase plus the vendor adapters.
// Plan: ai-hq projects/platform/accounts/plan-2026-11-01.md, with its revision of 2026-11-01 evening (job 11):
// 6-digit codes instead of emailed links, two levels (basic, full), invitations, and automatic takeover by a proven
// doctor. The check by the domain of an email address is gone.
import { cleanTelehealth, TELE_DEFAULT } from "../telehealth.mjs";
import { screen, BLURB_MAX } from "./screen.mjs";
import { checkPhoto } from "./image.mjs";
import { contactChanges } from "./listings.mjs";
import { PROC_LONG } from "../procedures.mjs";
import { UPCOMING_SLUGS } from "../upcoming.mjs";
import { Fail, PROCS, EMAIL_RX, nameMatch, normEmail, npiOk, radiologistKey, randomToken, sha256, sixDigits, splitName, nameHit } from "./util.mjs";

export const TERMS_VERSION = "draft-2026-11-03";
export const CODE_MINUTES = 60;          // a sign-in code works once, for one hour
export const CODE_TRIES = 5;             // wrong tries before a code stops working
export const INVITE_DAYS = 7;
export const DOCTOR_INVITES = 5;         // lifetime, per full-access doctor; his are unlimited
export const SESSION_HOURS = 12;
export const LIMITS = {           // [window seconds, max]
  signup_ip: [3600, 3], signup_email: [3600, 3], login_email: [3600, 5], login_ip: [3600, 20], code_ip: [3600, 30],
  check_account: [86400, 5], link_ip: [3600, 30], edit_account: [3600, 60], photo_account: [86400, 10],
  lookup_ip: [3600, 120], invite_ip: [3600, 30], email_change: [3600, 3], code_email: [86400, 10], invite_create: [3600, 20],
};
// Decision 3A (his yes, 2026-11-04): login_email and code_email count per email and connection together, so a stranger's
// requests never block the doctor's own browser; of the daily email cap, 40 stay for sign-in codes to existing accounts.
export const EMAIL_DAY = 90, EMAIL_RESERVED_LOGIN = 40;
export const PROC_NAMES = Object.fromEntries(Object.entries(PROC_LONG).map(([k, v]) => [k, v[0].toLowerCase() + v.slice(1)]));
export const ATTEST = (proc) => `I personally perform ${PROC_NAMES[proc]}. I am the physician named on this account, ` +
  "and what I enter about my practice is accurate.";
// The one agreement on the sign-up and invitation pages: who they are and the terms. Job 22 (his words, 2026-11-03):
// procedures are no longer asked at sign-up; each one is attested on its own (ATTEST) when the doctor adds it.
export const AGREEMENT = (name, npi) => `I am ${name}, the physician with NPI ${npi}. I am an interventional radiologist, ` +
  "and what I enter about my practice is accurate. I accept the Every Option terms of service and privacy policy.";

export const SPECIALTIES = { ir: "Interventional radiology", dr: "Diagnostic radiology", other: "Other" };

// Levels, job 22 (his words, 2026-11-03: "If someone has partial access, they can freely edit their profile, but until
// they confirm and get full access, they will only be in group B"; "Photo stays behind proof. Website link can be on
// partial."). Basic (shown as "partial"): procedures, notes, insurances, offices, phone, website link; the card stays in
// Likely performs. Full: also the photo, full-access invitations, and the card moves to Confirmed.
export const LEVEL_OF = { doximity: "full", identity: "full", invite_owner: "full", invite_doctor: "full",
  invite_published: "basic", email_code: "basic" };
const PROVEN = ["doximity", "identity"];               // the proofs that take over an NPI held without one
const CAN_INVITE = (a) => a.level === "full" && !a.invite_banned;

// Stage 2 fields a doctor may edit, each with its own check. Free text goes through the screen.
export const INSURERS = ["Aetna", "Blue Cross Blue Shield", "Cigna", "Humana", "Kaiser Permanente", "Medicaid", "Medicare",
  "Tricare", "UnitedHealthcare"];
const CONTACT = ["booking_url", "offices"];
const UNDOABLE = ["blurbs", "insurances", "insurance_other", "insurance_confirm", "booking_url", "offices", "photo", "attested", "telehealth",
  "also_performs", "also_performs_other"];
const FIELD_COL = { photo: "photo_key" };
const DEFAULTS = { insurances: [], insurance_other: "", insurance_confirm: false, booking_url: "", offices: [], blurbs: {}, attested: [],
  telehealth: TELE_DEFAULT, also_performs: [], also_performs_other: "" };
const NAMES = { booking_url: "website or booking link", offices: "office details" };
const bad = { bad: true };
function text(v, max) {
  if (typeof v !== "string") return bad;
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length > max) return bad;
  const r = screen(s, max);
  return r.ok ? { value: s } : { value: s, blocked: r.reasons };
}
const FIELDS = {
  blurbs(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return bad;
    const out = {}, blocked = {};
    for (const [k, t] of Object.entries(v)) {
      if (!PROCS.includes(k) || typeof t !== "string") return bad;
      const s = t.replace(/\s+/g, " ").trim();
      if (!s) continue;
      const r = screen(s, BLURB_MAX);
      if (!r.ok) blocked[k] = r.reasons;
      out[k] = s;
    }
    return Object.keys(blocked).length ? { value: out, blocked } : { value: out };
  },
  insurances(v) {
    if (!Array.isArray(v) || v.some((x) => !INSURERS.includes(x))) return bad;
    return { value: [...new Set(v)].sort() };
  },
  insurance_other: (v) => (v === "" ? { value: "" } : text(v, 100)),
  insurance_confirm: (v) => (typeof v === "boolean" ? { value: v } : bad),
  booking_url(v) {
    if (v === "") return { value: "" };
    if (typeof v !== "string" || v.length > 300) return bad;
    let u; try { u = new URL(v.trim()); } catch (_) { return bad; }
    if (u.protocol !== "https:" || u.username || u.password || /^[\d.]+$|^\[/.test(u.hostname) || !u.hostname.includes(".")) return bad;
    return { value: u.href };
  },
  // Job platform-directory-0007: video visits. Saved on partial or full access; only a Confirmed card shows it.
  telehealth(v) { const c = cleanTelehealth(v); return c ? { value: c } : bad; },
  // Job platform-directory-0036: procedures not on the site yet. Private: never in the overlay, the export or a page; it
  // lists nobody and attests nothing. Slugs from the current tick list only (lib/upcoming.mjs), kept once each, in list order.
  also_performs(v) {
    if (!Array.isArray(v) || v.length > 100 || v.some((x) => !UPCOMING_SLUGS.includes(x))) return bad;
    return { value: UPCOMING_SLUGS.filter((s) => v.includes(s)) };
  },
  also_performs_other: (v) => (v === "" ? { value: "" } : text(v, 120)),
  offices(v) {
    if (!Array.isArray(v) || v.length > OFFICES_MAX) return bad;
    const out = [], blocked = [];
    for (const o of v) {
      if (!o || typeof o !== "object") return bad;
      const practice = String(o.practice || "").trim(), city = String(o.city || "").trim();
      const state = String(o.state || "").trim().toUpperCase(), zip = String(o.zip || "").trim();
      const street = String(o.street || "").trim().replace(/\s+/g, " ");
      const phone = String(o.phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
      if (practice.length > 120 || !city || city.length > 60 || !/^[A-Z]{2}$/.test(state) || !/^\d{5}$/.test(zip)) return bad;
      if (street.length > 120) return bad;
      if (o.phone && phone.length !== 10) return bad;
      for (const t of [practice, street, city]) { const r = screen(t, 120); if (!r.ok) blocked.push(...r.reasons); }
      out.push({ practice, street, city, state, zip, phone });
    }
    return blocked.length ? { value: out, blocked: [...new Set(blocked)] } : { value: out };
  },
};
const EDITABLE = Object.keys(FIELDS);

const iso = (t) => new Date(t).toISOString();

// Job 16: offices with a street address. Coordinates come once, when an office is saved, from the geocoder
// interface (local stand-in in tests; the U.S. Census geocoder adapter in vendors.mjs, off until accounts are
// connected). An office whose address the geocoder cannot match keeps geo "zip": the finder uses its ZIP center.
export const OFFICES_MAX = 5;
const addrKey = (o) => [o.street, o.city, o.state, o.zip].map((x) => String(x || "").trim().toLowerCase().replace(/\s+/g, " ")).join("|");
const sameOffice = (a, b) => a.practice === b.practice && a.city === b.city && a.state === b.state && a.zip === b.zip;
const FULL_ONLY = ["photo"];                 // job 22: offices, phone and link moved to partial access

export function makeService(b, env = {}) {
  const now = env.now || (() => Date.now());
  const D = b.data;
  const origin = env.origin || "";
  const limit = async (name, key) => {
    const [win, max] = LIMITS[name];
    if (!(await D.hit(`${name}:${(await sha256("eo-acct:" + name + ":" + String(key))).slice(0, 32)}`, win, max, now()))) throw new Fail(429, "rate_limited");
  };
  const codeHash = (challenge, code) => sha256(`eo-code:${challenge}:${code}`);

  // A code is tied to a challenge the browser holds (returned by the request that sent the code). Only hashes are
  // stored, and the code hash is salted with the challenge, so the table alone cannot be searched for codes.
  async function issueCode(purpose, email, payload, { send: doSend = true, reserved = false } = {}) {
    const challenge = randomToken(32), code = sixDigits();
    await D.insert("codes", { challenge_hash: await sha256(challenge), purpose, email,
      code_hash: doSend ? await codeHash(challenge, code) : await sha256(randomToken(16)), payload: payload || {},
      tries: 0, expires_at: iso(now() + CODE_MINUTES * 60000), used_at: null, created_at: iso(now()) });
    if (doSend) await send({ to: email, subject: `${code} is your Every Option code`,
      text: `Your Every Option code is ${code}.\nType it on the page where you asked for it. It works once, for one hour.\n\n` +
        "If you did not ask for this, ignore this email." }, reserved);
    return challenge;
  }

  async function newSession(acct) {
    const st = randomToken(32);
    await D.insert("sessions", { token_hash: await sha256(st), account_id: acct.id,
      expires_at: iso(now() + SESSION_HOURS * 3600000), revoked_at: null, created_at: iso(now()) });
    return st;
  }

  async function nppesPerson(npi) {
    const p = await b.nppes.lookup(npi);
    if (!p || p.type !== "NPI-1") return null;
    // Any physician NPI may sign up; the doctor states the specialty on the page. Every listed code counts, not just
    // the primary. Residents and fellows are often under the trainee code 390200000X and some never change it.
    const codes = p.taxonomies && p.taxonomies.length ? p.taxonomies : [p.taxonomy || ""];
    const degree = /^(m\.?\s*d\.?|d\.?\s*o\.?)$/i;
    const hasDegree = String(p.credential || "").split(/[,;/]/).some((c) => degree.test(c.trim()));
    return { ...p, name: `${p.first} ${p.last}`.trim(),
      physician: codes.some((c) => /^20/.test(c) || c === "390200000X") || hasDegree,
      radiology: codes.some((c) => /^2085/.test(c)) };
  }

  async function logEdit(account, field, before, after, extra = {}) {
    const { npi = account.npi, ...rest } = extra;
    return D.insert("edits", { account_id: account.id, npi: npi || "", field, before: before ?? null,
      after: after ?? null, at: iso(now()), undone_by: null, undo_of: null, ...rest });
  }

  // Every email goes through here: a daily cap under the email service's free limit (Resend free: 100 a day).
  // Decision 3A: every email but a sign-in code to an existing account also counts against the other share (50 of 90).
  async function send(msg, reserved = false) {
    if (!msg.to) return;
    const cap = env.emailDailyCap || EMAIL_DAY, other = cap - Math.min(EMAIL_RESERVED_LOGIN, Math.floor(cap * EMAIL_RESERVED_LOGIN / EMAIL_DAY));
    if ((!reserved && !(await D.hit("email_day_other", 86400, other, now()))) || !(await D.hit("email_day", 86400, cap, now()))) {
      if (await D.hit("email_cap_noted", 86400, 1, now())) await exception("email_cap", "", { cap, other });
      throw new Fail(429, "rate_limited");
    }
    await b.email.send(msg);
  }

  // Review round 1 (job 30): a notice that follows a change already saved must not fail the request (the daily cap
  // can be used up by anyone). It is recorded instead, so he still sees it.
  async function notice(msg, npi = "", accountId = null) {
    try { await send(msg); } catch (e) {
      await exception("notice_failed", npi || "", { subject: msg.subject, error: e.code || "error" }, accountId).catch(() => {});
    }
  }

  async function notifyContact(acct, fields) {
    await notice({ to: acct.email, subject: "Your Every Option contact details changed",
      text: `The ${fields.map((f) => NAMES[f] || f).join(" and ")} on your Every Option listing (NPI ${acct.npi}) changed just now.\n` +
        `If this was not you, sign in at ${origin}/account/ and undo it, or reply to this email.` }, acct.npi, acct.id);
  }

  // Job 25: changes are live within a minute, so a phone, address or link change on a listing that already existed is
  // reported to the Every Option topic (NPI, field, old and new) and recorded. Never awaited by the save: a failure
  // here cannot hold it up or undo it.
  function contactAlert(acct, before, after) {
    return alertHim(acct, async () => contactChanges(before, after, b.listings ? await b.listings.get(acct.npi) : null),
      "contact_change", "contact change on an existing listing", (c) => `${c.field}: "${c.old || "(none)"}" -> "${c.new || "(none)"}"`,
      // Job 30: the email goes to the account's own login email, which may be an impostor's, not the doctor's.
      acct.email ? "The account's login email is being told (not proof it is the doctor's)." : "No email on file for this account.");
  }
  // Review round 1: a removal is live too and overrides public pages, so removing a publicly listed procedure alerts.
  function removalAlert(acct, proc) {
    return alertHim(acct, async () => {
      const listed = b.listings ? await b.listings.get(acct.npi) : null;
      return listed && (listed.procedures || []).includes(proc) ? [{ field: "procedure", old: proc, new: "removed from list" }] : [];
    }, "listing_removed", "a publicly listed procedure removed", (c) => `${c.old.toUpperCase()}: ${c.new} (a public page lists it)`,
      "No email sent to the doctor.");
  }
  // Job 31 (his yes, 2026-11-04): a public card for a doctor not already listed alerts him each time it goes public:
  // its procedure list goes from empty to not empty ("made"), and its contact details go from none to some ("first
  // details"), which the contact-change alert keeps quiet. Other saves alert as contact changes. Nothing here checks
  // the person.
  function newCardAlert(acct, stage) {
    return alertHim(acct, async () => {
      if (!acct.npi || (b.listings && await b.listings.get(acct.npi))) return [];
      const p = await D.one("profiles", { npi: acct.npi });
      if (!p || !(p.attested || []).length) return [];
      const offs = p.offices || [], join = (xs) => xs.filter(Boolean).join("; ");
      return [{ k: "procedures", v: p.attested.map((x) => x.toUpperCase()).join(", ") },
        { k: "phone", v: join(offs.map((o) => o.phone)) },
        { k: "address", v: join(offs.map((o) => [o.practice, o.street, o.city, o.state, o.zip].filter(Boolean).join(", "))) },
        { k: "website", v: p.booking_url || "" }];
    }, "new_card", stage === "made" ? "new public card for a doctor not already listed"
      : "new public card for a doctor not already listed, first contact details", (c) => `${c.k}: ${c.v || "(none)"}`,
    "Anyone who types a public NPI can make one.");
  }
  function alertHim(acct, changes, kind, what, line, tail) {
    const job = (async () => {
      const ch = await changes();
      if (!ch.length) return;
      await exception(kind, acct.npi, { changes: ch }, acct.id).catch(() => {});
      if (b.alert) await b.alert.send([`Every Option: ${what}, NPI ${acct.npi} (registry name ${acct.name}; ` +
        `made by an account with ${acct.level === "full" ? "full" : "partial"} access).`,
        ...ch.map(line), `Saved and live within a minute. ${tail}`].join("\n"));
    })().catch((e) => console.error("alert", e && e.message ? e.message.slice(0, 80) : "error"));
    if (env.waitUntil) env.waitUntil(job);
    return job;
  }

  async function exception(kind, npi, detail, accountId = null) {
    await D.insert("exceptions", { kind, npi, account_id: accountId, detail, at: iso(now()), resolved_at: null });
  }

  // A new account. With an NPI it holds that listing; without one (claim_npi set) it is waiting to prove itself.
  async function makeAccount({ npi, claimNpi, email, person, proof, invitedBy, procedures, newProfile }) {
    const acct = await D.insert("accounts", { npi: npi || null, claim_npi: claimNpi || null, email: email || null,
      claim_procedures: claimNpi ? procsFrom(procedures) : [],
      name: person.name, first_name: person.first, last_name: person.last, taxonomy: person.taxonomy || "",
      level: npi ? LEVEL_OF[proof] : "none", proof: npi ? proof : null, proof_name: null, proof_at: npi ? iso(now()) : null,
      invited_by: invitedBy || null, invite_banned: false, lost_npi: null, terms_version: TERMS_VERSION,
      terms_accepted_at: iso(now()), doximity_id: null, created_at: iso(now()) });
    await logEdit(acct, "account", null, { created: true, terms_version: TERMS_VERSION, proof }, { npi: npi || claimNpi });
    if (npi) {
      if (!(await D.one("profiles", { npi }))) await D.insert("profiles", { npi, account_id: acct.id, new_profile: !!newProfile,
        photo_key: null, insurances: [], insurance_other: "", insurance_confirm: false, booking_url: "", offices: [],
        blurbs: {}, attested: [], telehealth: { ...TELE_DEFAULT }, also_performs: [], also_performs_other: "", updated_at: iso(now()) });
      else {                     // a listing taken over from another account: the new holder starts from a fresh card
        await D.update("profiles", { npi }, { account_id: acct.id, updated_at: iso(now()) });
        await freshCard(acct, procsFrom(procedures));
        return acct;
      }
      if (procedures && procedures.length) await attestAs(acct, procedures);
    }
    return acct;
  }

  async function attestAs(acct, procs) {
    procs = procsFrom(procs);   // registry job 2: only keys the registry offers reach profiles.attested and attestations
    const prof = await D.one("profiles", { npi: acct.npi });
    const before = prof.attested || [];
    const after = [...new Set([...before, ...procs])].sort();
    for (const p of procs.filter((x) => !before.includes(x)))
      await D.insert("attestations", { account_id: acct.id, npi: acct.npi, procedure: p, statement: ATTEST(p),
        agreement: AGREEMENT(acct.name, acct.npi), at: iso(now()) });
    await D.update("profiles", { npi: acct.npi }, { attested: after, updated_at: iso(now()) });
    if (after.length !== before.length) {
      await logEdit(acct, "attested", before, after);
      if (!before.length) newCardAlert(acct, "made");
    }
    return after;
  }

  // Review rounds 1 and 2 (job 11): after a takeover, everything the removed account put on the card leaves
  // the card; the new holder's own procedures replace them. Each change is logged, so it stays on record and undoable.
  async function freshCard(acct, procs) {
    const prof = await D.one("profiles", { npi: acct.npi });
    const want = { booking_url: "", offices: [], photo_key: null, blurbs: {}, insurances: [], insurance_other: "",
      insurance_confirm: false, telehealth: TELE_DEFAULT, also_performs: [], also_performs_other: "", attested: procsFrom(procs).sort() };
    const patch = {};
    for (const [col, v] of Object.entries(want)) {
      if (JSON.stringify(prof[col] ?? (["telehealth", "also_performs", "also_performs_other"].includes(col) ? DEFAULTS[col] : null)) === JSON.stringify(v)) continue;
      patch[col] = v;
      await logEdit(acct, col === "photo_key" ? "photo" : col, prof[col] ?? null, v);
    }
    if (Object.keys(patch).length) await D.update("profiles", { npi: acct.npi }, { ...patch, updated_at: iso(now()) });
    for (const p of want.attested.filter((x) => !(prof.attested || []).includes(x)))
      await D.insert("attestations", { account_id: acct.id, npi: acct.npi, procedure: p, statement: ATTEST(p),
        agreement: AGREEMENT(acct.name, acct.npi), at: iso(now()) });
  }

  const procsFrom = (v) => [...new Set((Array.isArray(v) ? v : []).filter((p) => PROCS.includes(p)))];

  // Full access from a proof. On an account that holds its NPI: it becomes full. On a claimant (an NPI held by another
  // account): the plan's override rule.
  async function grantProof(acct, proof, proofName) {
    if (acct.npi) {
      const up = { proof_name: proofName || acct.proof_name || null, proof_at: iso(now()) };
      if (!PROVEN.includes(acct.proof) || proof === acct.proof) Object.assign(up, { proof, level: "full" });
      await D.update("accounts", { id: acct.id }, up);
      await logEdit(acct, "level", { level: acct.level, proof: acct.proof }, { level: "full", proof });
      return { ok: true, level: "full" };
    }
    if (!acct.claim_npi) throw new Fail(400, "no_npi");
    return takeover(acct, proof, proofName);
  }

  // Plan revision: a doctor proven by Doximity or ID automatically takes over an NPI held by an account without that
  // proof; the old account loses it and is told; edits stay logged and undoable. Other disputes go to exceptions.
  async function takeover(claimant, proof, proofName) {
    const npi = claimant.claim_npi;
    const holder = await D.one("accounts", { npi });
    await D.update("accounts", { id: claimant.id }, { proof, proof_name: proofName || null, proof_at: iso(now()) });
    if (holder && PROVEN.includes(holder.proof)) {
      await exception("dispute", npi, { holder: holder.id, holder_proof: holder.proof, claimant: claimant.id,
        claimant_proof: proof, claimant_email: claimant.email }, claimant.id);
      return { ok: true, dispute: true };
    }
    if (holder) await removeHolder(holder, `a physician proved they are ${holder.name} (NPI ${npi})`);
    await D.update("accounts", { id: claimant.id }, { npi, claim_npi: null, level: "full" });
    const acct = await D.one("accounts", { id: claimant.id });
    const prof = await D.one("profiles", { npi });
    if (prof) {
      await D.update("profiles", { npi }, { account_id: acct.id, updated_at: iso(now()) });
      await freshCard(acct, claimant.claim_procedures || []);
    } else await D.insert("profiles", { npi, account_id: acct.id, new_profile: !(await b.listings.get(npi)), photo_key: null,
      insurances: [], insurance_other: "", insurance_confirm: false, booking_url: "", offices: [], blurbs: {}, attested: [],
      telehealth: { ...TELE_DEFAULT }, also_performs: [], also_performs_other: "", updated_at: iso(now()) });
    if (!prof && (claimant.claim_procedures || []).length) await attestAs(acct, claimant.claim_procedures);
    await logEdit(acct, "takeover", holder ? { account: holder.id } : null, { account: acct.id, proof });
    return { ok: true, takeover: true, level: "full" };
  }

  // The holder loses the NPI: signed out everywhere, full access gone, its unused invitations and everyone it brought
  // in on an invitation lose full access too (they rest on its word), and it is told by email.
  async function removeHolder(holder, why) {
    const npi = holder.npi;
    await D.update("accounts", { id: holder.id }, { npi: null, lost_npi: npi, level: "none", proof: null });
    await D.update("sessions", { account_id: holder.id }, { revoked_at: iso(now()) });
    await revokeDownstream(holder.id, { includeSelf: false });
    await logEdit(holder, "lost_npi", { npi }, { npi: null }, { npi });
    if (!holder.email) await exception("holder_removed_no_email", npi, { holder: holder.id, why });
    await notice({ to: holder.email, subject: "Your Every Option account changed",
      text: `Your Every Option account no longer holds NPI ${npi}: ${why}.\nIf this is wrong, reply to this email and we ` +
        "will look into it. Edits made from your account stay on record." }, npi, holder.id);
  }

  // One step: the bad inviter loses full access and its unused invitations, and so does everyone whose full access
  // came through its invitations, all the way down. Someone downstream with their own Doximity or ID proof keeps it.
  async function revokeDownstream(rootId, { includeSelf = true, reason = "inviter revoked" } = {}) {
    const out = [];
    const queue = [rootId], seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      const a = await D.one("accounts", { id });
      if (!a) continue;
      for (const inv of await D.many("invitations", { inviter_account_id: id })) {
        if (!inv.used_at && !inv.revoked_at) await D.update("invitations", { id: inv.id }, { revoked_at: iso(now()) });
        if (inv.used_by) {
          const child = await D.one("accounts", { id: inv.used_by });
          if (child && child.invited_by === inv.id && !PROVEN.includes(child.proof)) queue.push(child.id);
        }
      }
      if (id === rootId && !includeSelf) continue;
      const up = { invite_banned: true };
      if (a.npi && a.level === "full") Object.assign(up, { level: "basic", proof: "revoked" });
      await D.update("accounts", { id }, up);
      if (a.level === "full") await logEdit(a, "level", { level: a.level, proof: a.proof }, { level: up.level || a.level, reason }, { npi: a.npi || a.lost_npi || a.claim_npi || "" });
      out.push(id);
    }
    return out;
  }

  const levelView = (a) => ({ attest: !!a.npi, blurbs: !!a.npi, insurances: !!a.npi, contact: !!a.npi,
    photo: !!a.npi && a.level === "full", invite: !!a.npi && CAN_INVITE(a) });

  async function inviteRow(token) {
    const tok = String(token || "");
    if (!/^[0-9a-f]{64}$/.test(tok)) throw new Fail(400, "invite_invalid");
    const inv = await D.one("invitations", { token_hash: await sha256(tok) });
    if (!inv || inv.used_at || inv.revoked_at || Date.parse(inv.expires_at) <= now()) throw new Fail(400, "invite_invalid");
    if (inv.inviter_account_id) {
      const by = await D.one("accounts", { id: inv.inviter_account_id });
      if (!by || by.invite_banned) throw new Fail(400, "invite_invalid");
    }
    return inv;
  }

  const svc = {
    async status() { return { open: true, doximity: !!b.doximity, identity: !!b.identity, terms_version: TERMS_VERSION }; },

    // "Is this you?": what the account page shows for an NPI before anything is typed. NPPES name only.
    async lookup(npi, ctx) {
      npi = String(npi || "").trim();
      if (!npiOk(npi)) throw new Fail(400, "invalid", { fields: ["npi"] });
      await limit("lookup_ip", ctx.ip);
      const person = await nppesPerson(npi);
      if (!person) throw new Fail(400, "npi_not_individual");
      if (!person.physician) throw new Fail(400, "not_a_physician");
      const listed = await b.listings.get(npi);
      return { ok: true, npi, name: person.name, listed_for: listed ? listed.procedures : [], radiology: person.radiology,
        held: !!(await D.one("accounts", { npi })), agreement: AGREEMENT(person.name, npi),
        attest_wording: Object.fromEntries(PROCS.map((p) => [p, ATTEST(p)])) };
    },

    // Sign up: NPI, "are you an interventional radiologist?", an email, one agreement. A code goes to the email; nothing
    // is stored for the person until the code is typed, except a waitlist row. Job 22: no procedures here (his words,
    // 2026-11-03: "they can select their procedures under their profile"); the specialty is one yes or no, and a
    // "no" may say what it is.
    async signup(body, ctx) {
      const npi = String(body.npi || "").trim(), email = normEmail(body.email);
      if (!npiOk(npi)) throw new Fail(400, "invalid", { fields: ["npi"] });
      if (!EMAIL_RX.test(email) || email.length > 200) throw new Fail(400, "invalid", { fields: ["email"] });
      const specialty = String(body.specialty || ""), specialtyOther = String(body.specialty_other || "").trim().slice(0, 100);
      if (!Object.hasOwn(SPECIALTIES, specialty)) throw new Fail(400, "invalid", { fields: ["specialty"] });
      if (body.agree !== true) throw new Fail(400, "agree_required");
      await limit("signup_ip", ctx.ip);
      await limit("signup_email", email);
      const person = await nppesPerson(npi);
      if (!person) throw new Fail(400, "npi_not_individual");
      if (!person.physician) throw new Fail(400, "not_a_physician");
      const listed = await b.listings.get(npi);
      if (specialty !== "ir") {                              // his rule 2026-11-03: anyone not stating IR waits
        const stated = specialty === "other" ? specialtyOther || "not IR" : SPECIALTIES[specialty];
        await D.insert("waitlist", { npi, email, name: person.name, taxonomy: person.taxonomy,
          taxonomy_desc: `Stated: ${stated}. Registry: ${person.taxonomy_desc || "none"}`, at: iso(now()) });
        return { ok: true, waitlist: true, message: "Thanks. Every Option lists interventional radiologists for now; you are on the waitlist." };
      }
      const sameEmail = await D.one("accounts", { email });
      const holder = await D.one("accounts", { npi });
      if (sameEmail && (!holder || sameEmail.id !== holder.id))
        throw new Fail(409, "email_in_use", { message: "That email already has an Every Option account. Sign in with it, or use a different email." });
      if (holder && holder.email === email)                  // they already have it: this is a sign-in
        return { ok: true, challenge: await issueCode("login", email, { account_id: holder.id }, { reserved: true }), signin: true };
      const procedures = procsFrom(body.procedures);      // the page no longer asks (job 22); kept for the API, one attestation each
      const who = { name: person.name, first: person.first, last: person.last, taxonomy: person.taxonomy || "" };
      if (holder) {
        const challenge = await issueCode("claim", email, { npi, procedures, person: who });
        return { ok: true, challenge, npi_taken: true, message: "This NPI already has an account. Type the code we sent, " +
          "then confirm who you are with Doximity or a photo ID. A confirmed doctor takes the listing over." };
      }
      return { ok: true, challenge: await issueCode("signup", email, { npi, procedures, new_profile: !listed, person: who }) };
    },

    // Sign in: a code to the email. The same answer whether or not the email has an account.
    async login(body, ctx) {
      const email = normEmail(body.email);
      if (!EMAIL_RX.test(email)) throw new Fail(400, "invalid", { fields: ["email"] });
      await limit("login_ip", ctx.ip);
      await limit("login_email", email + "|" + ctx.ip);
      const acct = await D.one("accounts", { email });
      const challenge = await issueCode("login", email, { account_id: acct ? acct.id : null }, { send: !!acct, reserved: true });
      return { ok: true, challenge, message: "If that email has an account, a 6-digit code is on its way." };
    },

    // Typing the code. Returns { session } for sign-up, claim and sign-in; email changes need the signed-in account.
    async useCode(body, ctx, signedIn = null) {
      const challenge = String(body.challenge || ""), code = String(body.code || "").replace(/\s/g, "");
      await limit("code_ip", ctx.ip);
      if (!/^[0-9a-f]{64}$/.test(challenge) || !/^\d{6}$/.test(code)) throw new Fail(400, "code_invalid");
      const ch = await sha256(challenge);
      const pre = await D.one("codes", { challenge_hash: ch });    // review round 1: tries counted per email too
      if (pre) await limit("code_email", pre.email + "|" + ctx.ip);
      const row = await D.tryCode(ch, await codeHash(challenge, code), CODE_TRIES, now());
      if (!row) throw new Fail(400, "code_invalid");
      const P = row.payload || {};
      if (row.purpose === "login") {
        const acct = P.account_id && await D.one("accounts", { id: P.account_id });
        if (!acct || acct.email !== row.email) throw new Fail(400, "code_invalid");
        return { ok: true, session: await newSession(acct) };
      }
      if (row.purpose === "email_change") {
        if (!signedIn || signedIn.id !== P.account_id) throw new Fail(401, "signed_out");
        const used = await D.one("accounts", { email: row.email });
        if (used && used.id !== signedIn.id) throw new Fail(409, "email_in_use");
        await D.update("accounts", { id: signedIn.id }, { email: row.email });
        await logEdit(signedIn, "login_email", { set: !!signedIn.email }, { set: true }, { npi: signedIn.npi || signedIn.claim_npi || "" });
        if (signedIn.email && signedIn.email !== row.email) await notice({ to: signedIn.email, subject: "Your Every Option login email changed",
          text: `The login email on your Every Option account changed to ${row.email}. If this was not you, reply to this email.` },
          signedIn.npi || signedIn.claim_npi || "", signedIn.id);
        return { ok: true, email: row.email };
      }
      if (row.purpose !== "signup" && row.purpose !== "claim") throw new Fail(400, "code_invalid");
      const person = P.person;          // read from NPPES when the code was sent, so an NPPES outage now cannot burn it
      if (await D.one("accounts", { email: row.email })) throw new Fail(409, "email_in_use");
      let acct;
      try {
        acct = (row.purpose === "signup" && !(await D.one("accounts", { npi: P.npi })))
          ? await makeAccount({ npi: P.npi, email: row.email, person, proof: "email_code", procedures: P.procedures, newProfile: P.new_profile })
          : await makeAccount({ claimNpi: P.npi, email: row.email, person, procedures: P.procedures });
      } catch (e) {
        if (e.code !== "conflict") throw e;          // two sign-ups raced for one NPI: the later one becomes a claimant
        acct = await makeAccount({ claimNpi: P.npi, email: row.email, person, procedures: P.procedures });
      }
      return { ok: true, session: await newSession(acct), claimant: !acct.npi };
    },

    async session(token) {
      if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
      const s = await D.one("sessions", { token_hash: await sha256(token) });
      if (!s || s.revoked_at || Date.parse(s.expires_at) <= now()) return null;
      return D.one("accounts", { id: s.account_id });
    },

    async logout(token) {
      if (token) await D.update("sessions", { token_hash: await sha256(token) }, { revoked_at: iso(now()) });
      return { ok: true };
    },

    async me(acct) {
      const npi = acct.npi || acct.claim_npi;
      const profile = acct.npi ? await D.one("profiles", { npi: acct.npi }) : null;
      const listing = npi ? await b.listings.get(npi) : null;
      const { id, email, name, level, proof, created_at, claim_npi, lost_npi } = acct;
      const invites = acct.npi && CAN_INVITE(acct) ? await svc.myInvites(acct) : null;
      return { account: { id, npi: acct.npi, claim_npi, lost_npi, email, name, level, proof, created_at },
        can: levelView(acct), listed_for: listing ? listing.procedures : [], profile, terms_version: TERMS_VERSION,
        insurers: INSURERS, doximity_linked: !!acct.doximity_id, invites,
        // Job 22: which group the card sits in on the finder. Full: Confirmed. Partial: Likely performs.
        group: acct.npi && acct.level === "full" ? "confirmed" : "likely",
        dispute: !!(acct.claim_npi && PROVEN.includes(acct.proof)),
        attest_wording: Object.fromEntries(PROCS.map((p) => [p, ATTEST(p)])) };
    },

    // Change or add the login email: a code to the new address; typed while signed in.
    async changeEmail(acct, body) {
      const email = normEmail(body.email);
      if (!EMAIL_RX.test(email) || email.length > 200) throw new Fail(400, "invalid", { fields: ["email"] });
      await limit("email_change", acct.id);
      const used = await D.one("accounts", { email });
      if (used && used.id !== acct.id) throw new Fail(409, "email_in_use", { message: "That email is already used by another Every Option account." });
      return { ok: true, challenge: await issueCode("email_change", email, { account_id: acct.id }) };
    },

    // ID and selfie through the identity provider. Only a status and the verified name come back.
    async checkIdentity(acct) {
      if (!b.identity) throw new Fail(503, "identity_off");
      await limit("check_account", acct.id);
      if (!acct.npi && !acct.claim_npi) throw new Fail(400, "no_npi");
      if (acct.npi && PROVEN.includes(acct.proof)) return { ok: true, already: true };
      for (const old of await D.many("identity_checks", { account_id: acct.id, status: "pending" })) {
        const r = await b.identity.cancel(old.provider_session);
        if (r === "processing") continue;
        await D.update("identity_checks", { id: old.id }, { status: "cancelled" });
        if (!r) await exception("redact_failed", acct.npi || acct.claim_npi, { session: old.provider_session }, acct.id);
      }
      const s = await b.identity.start({ accountId: acct.id, returnUrl: `${origin}/account/` });
      await D.insert("identity_checks", { account_id: acct.id, provider_session: s.session, status: "pending",
        verified_name: null, at: iso(now()) });
      return { ok: true, url: s.url };
    },

    // ID rule: last name exact; since decision 6A (2026-11-04) the first name exact too, for every upgrade.
    async identityResult(res) {          // res: { session, status, first, last } from the adapter
      if (!res) throw new Fail(400, "bad_signature");
      if (res.ignore) return { ok: true, ignored: true };
      const row = await D.one("identity_checks", { provider_session: res.session });
      if (!row) throw new Fail(400, "unknown_session");
      const acct = await D.one("accounts", { id: row.account_id });
      const npi = acct ? acct.npi || acct.claim_npi : "";
      if (res.redact_failed) await exception("redact_failed", npi || "", { session: res.session }, row.account_id);
      if (row.status !== "pending") return { ok: true, duplicate: true };
      if (!acct || (!acct.npi && !acct.claim_npi)) {
        await D.update("identity_checks", { id: row.id }, { status: "cancelled" });
        return { ok: true };
      }
      if (res.status !== "verified") {
        await D.update("identity_checks", { id: row.id }, { status: "failed" });
        return { ok: true };
      }
      const verifiedName = `${res.first} ${res.last}`.trim();
      if (!nameMatch({ first: res.first, last: res.last }, { first: acct.first_name, last: acct.last_name })) {
        await D.update("identity_checks", { id: row.id }, { status: "name_mismatch", verified_name: verifiedName });
        await exception("name_mismatch", npi, { nppes_name: acct.name, verified_name: verifiedName }, acct.id);
        return { ok: true };
      }
      // Decision 6A (his yes, 2026-11-04): every ID upgrade needs the exact first name, held listing or not.
      if (acct.npi && nameMatch({ first: res.first, last: res.last }, { first: acct.first_name, last: acct.last_name }) !== "exact") {
        await D.update("identity_checks", { id: row.id }, { status: "name_mismatch", verified_name: verifiedName });
        await exception("id_name_not_exact", npi, { nppes_name: acct.name, verified_name: verifiedName }, acct.id);
        return { ok: true };
      }
      // His yes, 2026-11-01: moving a listing from another account needs the exact first name ("Al" is not "Alan").
      if (!acct.npi && nameMatch({ first: res.first, last: res.last }, { first: acct.first_name, last: acct.last_name }) !== "exact") {
        await D.update("identity_checks", { id: row.id }, { status: "name_mismatch", verified_name: verifiedName });
        await exception("takeover_name_not_exact", npi, { nppes_name: acct.name, verified_name: verifiedName }, acct.id);
        return { ok: true };
      }
      await D.update("identity_checks", { id: row.id }, { status: "verified", verified_name: verifiedName });
      return grantProof(acct, "identity", verifiedName);
    },

    async attest(acct, body) {
      if (!acct.npi) throw new Fail(403, "no_npi");
      if (body.agree !== true) throw new Fail(400, "agree_required");
      const procs = procsFrom(body.procedures);
      if (!procs.length) throw new Fail(400, "invalid", { fields: ["procedures"] });
      return { ok: true, attested: await attestAs(acct, procs) };
    },

    // ---- Fuller cards. Basic: blurbs and insurances. Full: also offices, booking link and photo. Enforced here.
    async editProfile(acct, patch) {
      if (!acct.npi) throw new Fail(403, "no_npi");
      await limit("edit_account", acct.id);
      const extra = Object.keys(patch).filter((k) => !EDITABLE.includes(k));
      if (extra.length) throw new Fail(400, "invalid", { fields: extra });
      const clean = {}, blocked = {};
      for (const k of Object.keys(patch)) {
        const r = FIELDS[k](patch[k]);
        if (r.bad) throw new Fail(400, "invalid", { fields: [k] });
        if (r.blocked) blocked[k] = r.blocked;
        clean[k] = r.value;
      }
      if (Object.keys(blocked).length) throw new Fail(422, "screened", { blocked });
      const prof = await D.one("profiles", { npi: acct.npi });
      let unmatched = [];
      if (clean.offices) {
        const before = prof.offices || [];
        // Coordinates already found for the same address are kept, so an unchanged office is never looked up again.
        clean.offices = clean.offices.map((o) => {
          // a ZIP-center office is looked up again when a geocoder is configured (it may be on now, or back up)
          const p = before.find((x) => addrKey(x) === addrKey(o) && (x.geo === "address" || (x.geo === "zip" && !b.geocoder)));
          return p ? { ...o, lat: p.lat ?? null, lon: p.lon ?? null, geo: p.geo } : o;
        });
      }
      const changed = Object.keys(clean).filter((k) => JSON.stringify(prof[k]) !== JSON.stringify(clean[k]));
      if (!changed.length) return { ok: true, changed: [] };
      const needFull = changed.filter((k) => FULL_ONLY.includes(k));
      if (needFull.length && acct.level !== "full") throw new Fail(403, "full_needed", { fields: needFull });
      if (changed.includes("offices")) {
        // An office saved before streets were asked for may stay without one; any other office needs a street.
        const before = prof.offices || [];
        const noStreet = clean.offices.map((o, i) => (!o.street && !before.some((p) => !p.street && sameOffice(p, o)) ? i : -1)).filter((i) => i >= 0);
        if (noStreet.length) throw new Fail(400, "street_required", { fields: ["offices"], offices: noStreet });
        for (const [i, o] of clean.offices.entries()) {
          if (o.geo === "address") continue;
          let hit = null;
          const asked = !!(o.street && b.geocoder);       // no geocoder configured: saved quietly at the ZIP center
          if (asked) { try { hit = await b.geocoder.locate(o); } catch (_) { hit = null; } }
          const ok = hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon) && Math.abs(hit.lat) <= 90 && Math.abs(hit.lon) <= 180;
          clean.offices[i] = ok ? { ...o, lat: Math.round(hit.lat * 1e5) / 1e5, lon: Math.round(hit.lon * 1e5) / 1e5, geo: "address" }
            : { ...o, lat: null, lon: null, geo: "zip" };
          if (!ok && asked) unmatched.push(i);
        }
      }
      if (changed.includes("offices") && JSON.stringify(clean.offices) === JSON.stringify(prof.offices || [])) changed.splice(changed.indexOf("offices"), 1);
      if (!changed.length) return unmatched.length ? { ok: true, changed: [], unmatched } : { ok: true, changed: [] };
      await D.update("profiles", { npi: acct.npi }, { ...Object.fromEntries(changed.map((k) => [k, clean[k]])), updated_at: iso(now()) });
      for (const k of changed) await logEdit(acct, k, prof[k], clean[k]);
      const contact = changed.filter((k) => CONTACT.includes(k));
      if (contact.length) {
        if (!(prof.offices || []).length && !prof.booking_url) newCardAlert(acct, "first details");
        contactAlert(acct, prof, Object.fromEntries(contact.map((k) => [k, clean[k]])));
        await notifyContact(acct, contact);
      }
      return unmatched.length ? { ok: true, changed, unmatched } : { ok: true, changed };
    },

    async uploadPhoto(acct, bytes, declared) {
      if (!acct.npi) throw new Fail(403, "no_npi");
      if (acct.level !== "full") throw new Fail(403, "full_needed", { fields: ["photo"] });
      await limit("photo_account", acct.id);
      const r = checkPhoto(bytes, declared);
      if (!r.ok) throw new Fail(r.error === "photo_type" ? 415 : 400, r.error);
      const key = `${acct.npi}/${randomToken(8)}.${r.ext}`;
      await b.photos.put(key, r.bytes, r.type);
      const prof = await D.one("profiles", { npi: acct.npi });
      await D.update("profiles", { npi: acct.npi }, { photo_key: key, updated_at: iso(now()) });
      await logEdit(acct, "photo", prof.photo_key ?? null, key);
      return { ok: true, photo: key, width: r.width, height: r.height };
    },

    // Every edit on the NPI the account holds, including ones made by an account that has since lost it.
    async edits(acct) {
      if (!acct.npi) return { edits: [] };
      const rows = await D.many("edits", { npi: acct.npi });
      return { edits: rows.sort((a, c) => (a.at < c.at ? 1 : -1))
        .map(({ id, field, before, after, at, undo_of, undone_by, account_id }) => ({ id, field, before, after, at, undo_of, undone_by,
          by_you: account_id === acct.id, undoable: UNDOABLE.includes(field) && !undone_by &&
            (!FULL_ONLY.includes(field) || acct.level === "full") })) };
    },

    async undo(acct, body) {
      const eid = String(body.edit_id ?? "");
      if (!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|edits-\d+)$/.test(eid)) throw new Fail(404, "not_found");
      const e = await D.one("edits", { id: eid });
      if (!acct.npi || !e || e.npi !== acct.npi) throw new Fail(404, "not_found");
      const prof = await D.one("profiles", { npi: acct.npi });
      if (!prof || prof.account_id !== acct.id) throw new Fail(404, "not_found");
      if (!UNDOABLE.includes(e.field)) throw new Fail(400, "not_undoable");
      if (FULL_ONLY.includes(e.field) && acct.level !== "full") throw new Fail(403, "full_needed", { fields: [e.field] });
      if (e.undone_by) throw new Fail(409, "already_undone");
      if (JSON.stringify(prof[FIELD_COL[e.field] || e.field] ?? null) !== JSON.stringify(e.after ?? null)) throw new Fail(409, "changed_since");
      const col = FIELD_COL[e.field] || e.field;
      // Registry job 2: profiles.attested has no foreign key, so an undo restores only keys the registry still offers.
      // Job platform-directory-0036: likewise an undo of the private ticks restores only slugs still on the tick list.
      const back = e.field === "attested" ? procsFrom(e.before).sort()
        : e.field === "also_performs" ? UPCOMING_SLUGS.filter((s) => (Array.isArray(e.before) ? e.before : []).includes(s)) : e.before;
      await D.update("profiles", { npi: acct.npi }, { [col]: back ?? DEFAULTS[col] ?? null, updated_at: iso(now()) });
      const u = await logEdit(acct, e.field, e.after, back, { undo_of: e.id });
      await D.update("edits", { id: e.id }, { undone_by: u.id });
      // Review round 2: an undo of an "attested" edit can delist too (the attestation row stays), so it alerts the same way.
      if (e.field === "attested") for (const p of (prof.attested || []).filter((x) => !(back || []).includes(x))) removalAlert(acct, p);
      if (CONTACT.includes(e.field)) { contactAlert(acct, prof, { [col]: back ?? DEFAULTS[col] ?? null }); await notifyContact(acct, [e.field]); }
      return { ok: true, undone: e.id };
    },

    // Job 22: the doctor withdraws a procedure from their own account. The attestation records stay (append-only).
    // Job 25 (his yes, 2026-11-03): the doctor leaves that procedure's list within a minute, even when a public page
    // names it; withdrawing a publicly listed procedure alerts him (removalAlert).
    async withdraw(acct, body) {
      if (!acct.npi) throw new Fail(403, "no_npi");
      await limit("edit_account", acct.id);
      const proc = String(body.procedure || "");
      if (!PROCS.includes(proc)) throw new Fail(400, "invalid", { fields: ["procedure"] });
      const prof = await D.one("profiles", { npi: acct.npi });
      const before = prof.attested || [];
      if (!before.includes(proc)) return { ok: true, attested: before };
      const after = before.filter((x) => x !== proc);
      await D.update("profiles", { npi: acct.npi }, { attested: after, updated_at: iso(now()) });
      await logEdit(acct, "attested", before, after);
      removalAlert(acct, proc);
      return { ok: true, attested: after };
    },

    // Job 22: the doctor's own photo, served to the signed-in holder only (the bucket stays private).
    async photoFile(acct) {
      if (!acct.npi) throw new Fail(404, "not_found");
      const prof = await D.one("profiles", { npi: acct.npi });
      const m = /\.(jpg|png|webp)$/.exec((prof && prof.photo_key) || "");
      if (!m) throw new Fail(404, "not_found");
      const f = await b.photos.get(prof.photo_key);
      if (!f) throw new Fail(404, "not_found");
      return { bytes: f.bytes, type: { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[m[1]] };
    },

    // Removing a photo needs no proof (any holder may take their own photo down); putting one back by undo does.
    async removePhoto(acct) {
      if (!acct.npi) throw new Fail(403, "no_npi");
      await limit("edit_account", acct.id);
      const prof = await D.one("profiles", { npi: acct.npi });
      if (!prof.photo_key) return { ok: true, changed: [] };
      await D.update("profiles", { npi: acct.npi }, { photo_key: null, updated_at: iso(now()) });
      await logEdit(acct, "photo", prof.photo_key, null);
      return { ok: true, changed: ["photo"] };
    },

    // Job 22: find yourself by name and state, in our listings and the NPI Registry together. Public registry fields
    // only (name, credential, city, state, specialty); never an address, phone or anything from an account.
    async search(q, ctx) {
      const name = String(q.name || "").replace(/\s+/g, " ").trim(), state = String(q.state || "").trim().toUpperCase();
      if (name.length < 2 || name.length > 80) throw new Fail(400, "invalid", { fields: ["name"] });
      if (state && !/^[A-Z]{2}$/.test(state)) throw new Fail(400, "invalid", { fields: ["state"] });
      const who = splitName(name);
      if (who.last.replace(/\s/g, "").length < 2) throw new Fail(400, "invalid", { fields: ["name"] });
      await limit("lookup_ip", ctx.ip);
      const listed = b.listings.search ? await b.listings.search({ ...who, state }) : [];
      let reg = [], registry = "ok";
      try { reg = b.nppes.search ? await b.nppes.search({ ...who, state }) : []; } catch (_) { registry = "unavailable"; }
      const byNpi = new Map();
      for (const p of reg) {
        // The registry also matches former and other names, and any address in the state: keep only a real name match.
        if (!nameHit(`${p.first} ${p.last}`, who)) continue;
        const codes = p.taxonomies && p.taxonomies.length ? p.taxonomies : [p.taxonomy || ""];
        const degree = String(p.credential || "").split(/[,;/]/).some((c) => /^(m\.?\s*d\.?|d\.?\s*o\.?)$/i.test(c.trim()));
        if (!(codes.some((c) => /^20/.test(c) || c === "390200000X") || degree)) continue;      // physicians only
        byNpi.set(p.npi, { npi: p.npi, name: `${p.first} ${p.last}`.trim(), credential: p.credential || "", city: p.city || "",
          state: p.state || "", specialty: p.taxonomy_desc || "", listed_for: [] });
      }
      for (const l of listed) {
        const e = byNpi.get(l.npi) || { npi: l.npi, name: l.name, credential: "", city: l.city || "", state: l.state || "", specialty: "" };
        e.listed_for = l.procedures || [];
        byNpi.set(l.npi, e);
      }
      const results = [...byNpi.values()].sort((a, c) => (c.listed_for.length > 0) - (a.listed_for.length > 0) || a.name.localeCompare(c.name));
      return { ok: true, results: results.slice(0, 25), more: results.length > 25, registry };
    },

    // ---- Invitations: one NPI, one use, 7 days. His (full, unlimited, from a local command), a full-access doctor's
    // (full, 5 lifetime, from the account page), and to a published email (basic). Every one recorded with its inviter.
    async createInvite({ kind, npi, inviter = null, email = "" }) {
      npi = String(npi || "").trim();
      if (!["owner", "doctor", "published"].includes(kind)) throw new Fail(400, "invalid", { fields: ["kind"] });
      if (!npiOk(npi)) throw new Fail(400, "invalid", { fields: ["npi"] });
      let slot = null;
      if (kind === "doctor") {
        if (!inviter || !inviter.npi || !CAN_INVITE(inviter)) throw new Fail(403, "full_needed", { fields: ["invite"] });
        await limit("invite_create", inviter.id);
        if (inviter.npi === npi) throw new Fail(400, "invite_self");
        const made = await D.many("invitations", { inviter_account_id: inviter.id });
        if (made.length >= DOCTOR_INVITES) throw new Fail(403, "invite_limit");
        slot = made.length + 1;          // the database's unique (inviter, slot 1-5) key makes the cap hold under races
      }
      if (kind === "published") {
        email = normEmail(email);
        if (!EMAIL_RX.test(email)) throw new Fail(400, "invalid", { fields: ["email"] });
      }
      const person = await nppesPerson(npi);
      if (!person) throw new Fail(400, "npi_not_individual");
      if (!person.physician) throw new Fail(400, "not_a_physician");
      if (!person.radiology && !(await b.listings.get(npi))) throw new Fail(400, "not_radiologist");   // the waitlist rule
      const tok = randomToken(32);
      for (let tries = 0; ; tries++) {     // a parallel request took this slot: count again and take the next one
        try {
          await D.insert("invitations", { token_hash: await sha256(tok), npi, kind, inviter_account_id: kind === "doctor" ? inviter.id : null, slot,
            email: kind === "published" ? email : null, expires_at: iso(now() + INVITE_DAYS * 86400000), used_at: null,
            used_by: null, revoked_at: null, created_at: iso(now()) });
          break;
        } catch (e) {
          if (e.code !== "conflict" || slot === null || tries >= DOCTOR_INVITES) throw e.code === "conflict" ? new Fail(403, "invite_limit") : e;
          slot = (await D.many("invitations", { inviter_account_id: inviter.id })).length + 1;
          if (slot > DOCTOR_INVITES) throw new Fail(403, "invite_limit");
        }
      }
      if (inviter) await logEdit(inviter, "invite", null, { npi }, {});
      const holder = await D.one("accounts", { npi });
      return { ok: true, url: `${origin}/account/#invite=${tok}`, npi, name: person.name, held: !!holder,
        expires_at: iso(now() + INVITE_DAYS * 86400000), left: kind === "doctor" ? DOCTOR_INVITES - (await D.many("invitations", { inviter_account_id: inviter.id })).length : null };
    },

    async myInvites(acct) {
      const rows = await D.many("invitations", { inviter_account_id: acct.id });
      return { left: Math.max(0, DOCTOR_INVITES - rows.length), sent: rows.map((r) => ({ npi: r.npi, used: !!r.used_at,
        expired: !r.used_at && Date.parse(r.expires_at) <= now(), revoked: !!r.revoked_at, created_at: r.created_at })) };
    },

    // What the invitation page shows: the doctor's listing, the procedures to tick, the one agreement.
    async invitePreview(body, ctx) {
      await limit("invite_ip", ctx.ip);
      const inv = await inviteRow(body.token);
      const person = await nppesPerson(inv.npi);
      if (!person) throw new Fail(503, "registry_unavailable");
      const listed = await b.listings.get(inv.npi);
      return { ok: true, npi: inv.npi, name: person.name, listed_for: listed ? listed.procedures : [],
        level: inv.kind === "published" ? "basic" : "full", agreement: AGREEMENT(person.name, inv.npi),
        attest_wording: Object.fromEntries(PROCS.map((p) => [p, ATTEST(p)])) };
    },

    // Accepting: tick procedures, one agreement. No email needed now (one can be added later to sign in again).
    async inviteAccept(body, ctx, signedIn = null) {
      await limit("invite_ip", ctx.ip);
      if (body.agree !== true) throw new Fail(400, "agree_required");
      const inv = await inviteRow(body.token);
      const proof = { owner: "invite_owner", doctor: "invite_doctor", published: "invite_published" }[inv.kind];
      const holder = await D.one("accounts", { npi: inv.npi });
      const procedures = procsFrom(body.procedures);      // the page no longer asks (job 22); each still gets its own attestation
      const email = inv.kind === "published" ? inv.email : null;
      const emailUser = email && await D.one("accounts", { email });
      if (holder && !(signedIn && signedIn.id === holder.id) && inv.kind !== "owner") {
        await exception("invite_npi_held", inv.npi, { invitation: inv.id, holder: holder.id, kind: inv.kind });
        throw new Fail(409, "npi_taken", { message: "This listing already has an account. We will look into it and contact you." });
      }
      if (!(await D.consumeInvite(inv.token_hash, now()))) throw new Fail(400, "invite_invalid");
      const person = await nppesPerson(inv.npi);
      let acct;
      if (holder && signedIn && signedIn.id === holder.id) {       // the holder accepting: an upgrade
        acct = holder;
        if (LEVEL_OF[proof] === "full" && holder.level !== "full") {
          await D.update("accounts", { id: holder.id }, { level: "full", proof, invited_by: inv.id, proof_at: iso(now()) });
          await logEdit(holder, "level", { level: holder.level }, { level: "full", proof });
        }
        if (procedures.length) await attestAs(holder, procedures);
      } else {
        if (holder) {
          if (PROVEN.includes(holder.proof)) await exception("owner_invite_over_proven", inv.npi, { holder: holder.id, invitation: inv.id });
          await removeHolder(holder, "the site owner sent an invitation for this listing to its physician");
        }
        try {
          acct = await makeAccount({ npi: inv.npi, email: emailUser ? null : email, person, proof, invitedBy: inv.id,
            procedures, newProfile: !(await b.listings.get(inv.npi)) });
        } catch (e) {
          if (e.code !== "conflict") throw e;
          await exception("invite_race", inv.npi, { invitation: inv.id });
          throw new Fail(409, "npi_taken", { message: "This listing just got an account. We will look into it and contact you." });
        }
      }
      await D.update("invitations", { id: inv.id }, { used_by: acct.id });
      return { ok: true, session: await newSession(acct), level: LEVEL_OF[proof] === "full" || acct.level === "full" ? "full" : "basic" };
    },

    // His one-step revoke of a bad inviter and everyone whose full access came through it (local command only).
    async revokeInviter(accountIdOrNpi) {
      // Review round 1: an NPI is looked up as an NPI (then as a lost NPI), never as an id; an id must look like one.
      const k = String(accountIdOrNpi || "").trim();
      let a = null;
      if (/^\d{10}$/.test(k)) {
        // Review round 2: after a takeover the NPI's holder is the proven doctor, not the bad inviter, and several
        // accounts may have lost the same NPI. More than one match: refuse and list them; he picks by id.
        const all = [...await D.many("accounts", { npi: k }), ...await D.many("accounts", { lost_npi: k })];
        if (all.length > 1) throw new Fail(409, "ambiguous", { candidates: all.map((x) => ({ id: x.id, name: x.name,
          holds: x.npi === k, level: x.level, proof: x.proof, created_at: x.created_at })) });
        a = all[0] || null;
      }
      else if (/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|accounts-\d+)$/.test(k)) a = await D.one("accounts", { id: k });
      if (!a) throw new Fail(404, "not_found");
      const ids = await revokeDownstream(a.id);
      await exception("inviter_revoked", a.npi || a.lost_npi || "", { root: a.id, accounts: ids });
      return { ok: true, revoked: ids };
    },

    // ---- Sign in with Doximity, behind its switch. Linking it to a signed-in account counts as proof (full access, or
    // the takeover rule) when its name and specialty match NPPES and the name is unique among radiologists.
    async doximityStart() {
      const state = randomToken(16), verifier = randomToken(32);            // PKCE verifier stays in an HttpOnly cookie
      return { state, cookie: `${state}.${verifier}`, url: await b.doximity.authorizeUrl(state, verifier) };
    },

    async doximityCallback({ code, state, cookieState }) {
      const [cs, verifier] = String(cookieState || "").split(".");
      if (!code || !state || !cs || !verifier || state !== cs) return { result: "failed" };
      const prof = await b.doximity.profile(code, verifier);
      if (!prof || !prof.id) return { result: "failed" };
      const acct = await D.one("accounts", { doximity_id: prof.id });
      if (acct) return { result: "signed-in", session: await newSession(acct) };
      const tok = randomToken(32);
      await D.insert("login_links", { token_hash: await sha256(tok), purpose: "doximity", email: "", payload: { profile: {
        id: prof.id, first: prof.first, last: prof.last, credentials: prof.credentials || "", specialty: prof.specialty || "" } },
        expires_at: iso(now() + 15 * 60000), used_at: null, created_at: iso(now()) });
      // The token is tied to this browser by a cookie holding its hash, so a crafted link sent to a signed-in doctor
      // cannot attach someone else's Doximity account.
      return { result: tok, linkCookie: await sha256(tok) };
    },

    async doximityPreview(body, cookieHash) {
      const tok = String(body.token || "");
      if (!/^[0-9a-f]{64}$/.test(tok) || cookieHash !== (await sha256(tok))) throw new Fail(403, "other_browser");
      const l = await D.one("login_links", { token_hash: await sha256(tok) });
      if (!l || l.purpose !== "doximity" || l.used_at || Date.parse(l.expires_at) <= now()) throw new Fail(400, "link_invalid");
      const p = l.payload.profile;
      return { ok: true, name: `${p.first} ${p.last}`.trim(), credentials: p.credentials, specialty: p.specialty };
    },

    async doximityLink(acct, body, cookieHash) {
      const tok = String(body.token || "");
      if (!/^[0-9a-f]{64}$/.test(tok)) throw new Fail(400, "link_invalid");
      if (cookieHash !== (await sha256(tok))) throw new Fail(403, "other_browser");
      const link = await D.consumeLink(await sha256(tok), now());
      if (!link || link.purpose !== "doximity") throw new Fail(400, "link_invalid");
      const p = link.payload.profile, npi = acct.npi || acct.claim_npi;
      if (!npi) throw new Fail(400, "no_npi");
      if (!nameMatch({ first: p.first, last: p.last }, { first: acct.first_name, last: acct.last_name })) {
        await exception("doximity_name_mismatch", npi, { nppes_name: acct.name, doximity_name: `${p.first} ${p.last}`,
          specialty: p.specialty }, acct.id);
        throw new Fail(409, "name_mismatch");
      }
      if (!acct.npi && nameMatch({ first: p.first, last: p.last }, { first: acct.first_name, last: acct.last_name }) !== "exact") {
        await exception("takeover_name_not_exact", npi, { nppes_name: acct.name, doximity_name: `${p.first} ${p.last}` }, acct.id);
        throw new Fail(409, "name_mismatch");
      }
      const other = await D.one("accounts", { doximity_id: p.id });
      if (other && other.id !== acct.id) throw new Fail(409, "doximity_in_use");
      await D.update("accounts", { id: acct.id }, { doximity_id: p.id });
      await logEdit(acct, "doximity", null, { linked: true, specialty: p.specialty }, { npi });
      // Proof: specialty radiology on both sides, and exactly one radiologist in the national list with this last name
      // and first initial, and it is this NPI.
      const specialtyOk = /radiolog/i.test(p.specialty || "") && /^2085/.test(acct.taxonomy || "");
      const u = specialtyOk ? await b.radiologists.lookup(radiologistKey(acct.first_name, acct.last_name)) : null;
      const unique = !!u && u.n === 1 && u.npi === npi;
      if (!specialtyOk || !unique) return { ok: true, linked: true, proof: false,
        reason: !specialtyOk ? "specialty" : "name_not_unique" };
      const r = await grantProof(await D.one("accounts", { id: acct.id }), "doximity", `${p.first} ${p.last}`.trim());
      return { ...r, linked: true, proof: true };
    },
  };
  return svc;
}

// What the export merges into the finder data: accounts holding an NPI with at least one attested procedure. Job 22:
// "confirmed" only for full access (Confirmed group); partial access sits in Likely performs with its own offices,
// phone and link (his words, 2026-11-03). The photo only while the account has full access.
export async function exportConfirmed(b) {
  const out = [];
  for (const a of await b.data.many("accounts")) {
    if (!a.npi || a.level === "none") continue;
    const p = await b.data.one("profiles", { npi: a.npi });
    if (!p || p.account_id !== a.id || !(p.attested || []).length) continue;
    const full = a.level === "full";
    out.push({ npi: a.npi, name: a.name, procedures: [...p.attested], new_profile: !!p.new_profile, level: a.level,
      confirmed: full, photo: full ? p.photo_key || "" : "", insurances: p.insurances || [], insurance_other: p.insurance_other || "",
      insurance_confirm: !!p.insurance_confirm, booking_url: p.booking_url || "",
      offices: (p.offices || []).map((o) => ({ practice: o.practice || "", street: o.street || "", city: o.city, state: o.state,
        zip: o.zip, phone: o.phone || "", lat: o.geo === "address" ? o.lat : null, lon: o.geo === "address" ? o.lon : null,
        geo: o.geo === "address" ? "address" : "zip" })),
      blurbs: p.blurbs || {},
      // Job platform-directory-0007: a partial account's answer never leaves the database.
      ...(full ? { telehealth: cleanTelehealth(p.telehealth) || { ...TELE_DEFAULT } } : {}) });
  }
  return out;
}
