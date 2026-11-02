// Physician accounts: the rules, written once against the small interfaces in lib/accounts/README.md.
// The same code runs with the local stand-ins (lib/accounts/local.mjs) and with Supabase plus the vendor adapters.
// Plan: ai-hq projects/platform/accounts/plan-2026-11-01.md.
import { Fail, PROCS, EMAIL_RX, baseDomain, nameFrom, normEmail, npiOk, randomToken, sameName, sha256 } from "./util.mjs";

export const TERMS_VERSION = "draft-2026-11-01";
export const LINK_MINUTES = 15;
export const SESSION_HOURS = 12;
export const LIMITS = {           // [window seconds, max]
  signup_ip: [3600, 5], login_email: [3600, 5], login_ip: [3600, 20], check_account: [86400, 5],
  link_ip: [3600, 30], edit_account: [3600, 60], photo_account: [86400, 10],
};
export const PROC_NAMES = { ufe: "uterine fibroid embolization (UFE)", pae: "prostate artery embolization (PAE)",
  gae: "genicular artery embolization (GAE)" };
export const ATTEST = (proc) => `I personally perform ${PROC_NAMES[proc]}. I am the physician named on this account, ` +
  "and what I enter about my practice is accurate.";

// A page on one of these sites is not the doctor's own, so its domain never proves a work email.
const NOT_OWN = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "proton.me",
  "protonmail.com", "me.com", "live.com", "msn.com", "healthgrades.com", "vitals.com", "webmd.com", "doximity.com",
  "zocdoc.com", "linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com", "yelp.com",
  "google.com", "npino.com", "npiprofile.com", "sharecare.com", "usnews.com", "castleconnolly.com", "wikipedia.org",
  "ratemds.com", "medicare.gov", "cms.gov", "clinicaltrials.gov", "nih.gov", "researchgate.net", "pubmed.gov"];

const iso = (t) => new Date(t).toISOString();

export function makeService(b, env = {}) {
  const now = env.now || (() => Date.now());
  const D = b.data;
  const limit = async (name, key) => {
    const [win, max] = LIMITS[name];
    if (!(await D.hit(`${name}:${await sha256(String(key))}`, win, max, now()))) throw new Fail(429, "rate_limited");
  };
  const linkUrl = (purpose, tok) => `${env.origin || ""}/account/#${purpose === "work_email" ? "check" : "link"}=${tok}`;

  async function issueLink(purpose, email, payload) {
    const tok = randomToken(32);
    await D.insert("login_links", { token_hash: await sha256(tok), purpose, email, payload: payload || {},
      expires_at: iso(now() + LINK_MINUTES * 60000), used_at: null, created_at: iso(now()) });
    return tok;
  }

  async function nppesPerson(npi) {
    const p = await b.nppes.lookup(npi);
    if (!p || p.type !== "NPI-1") return null;
    return { ...p, name: `${p.first} ${p.last}`.trim(), physician: /^20/.test(p.taxonomy || ""),
      radiology: /^2085/.test(p.taxonomy || "") };
  }

  async function logEdit(account, field, before, after, extra = {}) {
    return D.insert("edits", { account_id: account.id, npi: account.npi, field, before: before ?? null,
      after: after ?? null, at: iso(now()), undone_by: null, undo_of: null, ...extra });
  }

  async function exception(kind, npi, detail, accountId = null) {
    await D.insert("exceptions", { kind, npi, account_id: accountId, detail, at: iso(now()), resolved_at: null });
  }

  const svc = {
    async status() { return { open: true, doximity: !!b.doximity, terms_version: TERMS_VERSION }; },

    // Stage 1 and 3: sign up with an NPI. Nothing is stored for the person until they use the emailed link, except
    // an exception row (second claimant) or a waitlist row.
    async signup(body, ctx) {
      const npi = String(body.npi || "").trim(), email = normEmail(body.email);
      if (!npiOk(npi)) throw new Fail(400, "invalid", { fields: ["npi"] });
      if (!EMAIL_RX.test(email) || email.length > 200) throw new Fail(400, "invalid", { fields: ["email"] });
      if (body.accept_terms !== true) throw new Fail(400, "terms_required");
      await limit("signup_ip", ctx.ip);
      const generic = { ok: true, message: "If this NPI can be claimed, a sign-in link is on its way to that email." };
      const person = await nppesPerson(npi);
      if (!person) throw new Fail(400, "npi_not_individual");
      if (!person.physician) throw new Fail(400, "not_a_physician");
      const listed = await b.listings.get(npi);
      if (!listed) {                                       // stage 3: a new profile
        const given = String(body.name || "").trim().slice(0, 120);
        if (!given || !sameName(given, person.name)) throw new Fail(400, "name_mismatch");
        if (!person.radiology) {
          await D.insert("waitlist", { npi, email, name: person.name, taxonomy: person.taxonomy,
            taxonomy_desc: person.taxonomy_desc || "", at: iso(now()) });
          return { ok: true, waitlist: true, message: "Thanks. Every Option lists radiologists for now; you are on the waitlist." };
        }
      }
      const sameEmail = await D.one("accounts", { email });
      if (sameEmail && sameEmail.npi !== npi) return generic;     // one email, one account; same answer as any other
      const taken = await D.one("accounts", { npi });
      if (taken) {
        if (taken.email === email) { await svc.login({ email }, ctx); return generic; }
        await exception("second_claimant", npi, { email_hash: await sha256(email) }, taken.id);
        return generic;
      }
      const tok = await issueLink("signup", email, { npi, terms_version: TERMS_VERSION, terms_at: iso(now()),
        new_profile: !listed });
      await b.email.send({ to: email, subject: "Your Every Option sign-in link",
        text: `Use this link within ${LINK_MINUTES} minutes to finish signing up for NPI ${npi}:\n${linkUrl("signup", tok)}\n\n` +
          "If you did not ask for this, ignore this email." });
      return generic;
    },

    async login(body, ctx) {
      const email = normEmail(body.email);
      if (!EMAIL_RX.test(email)) throw new Fail(400, "invalid", { fields: ["email"] });
      await limit("login_ip", ctx.ip);
      await limit("login_email", email);
      const acct = await D.one("accounts", { email });
      if (acct) {
        const tok = await issueLink("login", email, { account_id: acct.id });
        await b.email.send({ to: email, subject: "Your Every Option sign-in link",
          text: `Use this link within ${LINK_MINUTES} minutes to sign in:\n${linkUrl("login", tok)}\n\nIt works once.` });
      }
      return { ok: true, message: "If that email has an account, a sign-in link is on its way." };
    },

    // Uses a link once. Returns { session } for sign-up and login links.
    async useLink(body, ctx) {
      const tok = String(body.token || "");
      await limit("link_ip", ctx.ip);
      if (!/^[0-9a-f]{64}$/.test(tok)) throw new Fail(400, "link_invalid");
      const link = await D.consumeLink(await sha256(tok), now());
      if (!link) throw new Fail(400, "link_invalid");
      let acct;
      if (link.purpose === "signup") {
        const person = await nppesPerson(link.payload.npi);
        try {
          acct = await D.insert("accounts", { npi: link.payload.npi, email: link.email, name: person.name,
            taxonomy: person.taxonomy, status: "unverified", verified_method: null, verified_name: null,
            verified_at: null, terms_version: link.payload.terms_version, terms_accepted_at: link.payload.terms_at,
            doximity_id: null, created_at: iso(now()) });
        } catch (e) {
          if (e.code !== "conflict") throw e;
          const other = await D.one("accounts", { npi: link.payload.npi });
          await exception("second_claimant", link.payload.npi, { email_hash: await sha256(link.email) }, other && other.id);
          throw new Fail(409, "npi_taken");
        }
        await D.insert("profiles", { npi: acct.npi, account_id: acct.id, new_profile: !!link.payload.new_profile,
          photo_key: null, insurances: [], insurance_other: "", insurance_confirm: false, booking_url: "", offices: [],
          blurbs: {}, attested: [], updated_at: iso(now()) });
        await logEdit(acct, "account", null, { created: true, terms_version: acct.terms_version });
      } else if (link.purpose === "login") {
        acct = await D.one("accounts", { id: link.payload.account_id });
        if (!acct) throw new Fail(400, "link_invalid");
      } else if (link.purpose === "work_email") {
        acct = await D.one("accounts", { id: link.payload.account_id });
        if (!acct) throw new Fail(400, "link_invalid");
        if (acct.status !== "verified") {
          await D.update("accounts", { id: acct.id }, { status: "verified", verified_method: "work_email",
            verified_name: null, verified_at: iso(now()), work_email: link.email });
          await logEdit(acct, "verified", null, { method: "work_email" });
        }
        return { ok: true, verified: true };
      } else throw new Fail(400, "link_invalid");
      const st = randomToken(32);
      await D.insert("sessions", { token_hash: await sha256(st), account_id: acct.id,
        expires_at: iso(now() + SESSION_HOURS * 3600000), revoked_at: null, created_at: iso(now()) });
      return { ok: true, session: st };
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
      const profile = await D.one("profiles", { npi: acct.npi });
      const listing = await b.listings.get(acct.npi);
      const { id, npi, email, name, status, verified_method, created_at } = acct;
      return { account: { id, npi, email, name, status, verified_method, created_at },
        listed_for: listing ? listing.procedures : [], profile, terms_version: TERMS_VERSION,
        attest_wording: Object.fromEntries(PROCS.map((p) => [p, ATTEST(p)])) };
    },

    // Check 1: a work email whose domain matches a page on their own listing.
    async checkEmail(acct, body) {
      await limit("check_account", acct.id);
      const work = normEmail(body.work_email);
      if (!EMAIL_RX.test(work)) throw new Fail(400, "invalid", { fields: ["work_email"] });
      const listing = await b.listings.get(acct.npi);
      const dom = baseDomain(work.split("@")[1]);
      const domains = (listing ? listing.urls : []).map((u) => { try { return baseDomain(new URL(u).hostname); } catch (_) { return ""; } })
        .filter((d) => d && !NOT_OWN.includes(d));
      if (NOT_OWN.includes(dom) || !domains.includes(dom)) throw new Fail(400, "domain_no_match");
      const tok = await issueLink("work_email", work, { account_id: acct.id });
      await b.email.send({ to: work, subject: "Confirm your work email for Every Option",
        text: `Use this link within ${LINK_MINUTES} minutes to confirm this work email for NPI ${acct.npi}:\n${linkUrl("work_email", tok)}` });
      return { ok: true };
    },

    // Check 2: ID and selfie through the identity provider. Only a status and the verified name come back.
    async checkIdentity(acct) {
      await limit("check_account", acct.id);
      if (acct.status === "verified") return { ok: true, already: true };
      const s = await b.identity.start({ accountId: acct.id, returnUrl: `${env.origin || ""}/account/` });
      await D.insert("identity_checks", { account_id: acct.id, provider_session: s.session, status: "pending",
        verified_name: null, at: iso(now()) });
      return { ok: true, url: s.url };
    },

    async identityResult(res) {          // res: { session, status, first, last } from the adapter
      if (!res) throw new Fail(400, "bad_signature");
      if (res.ignore) return { ok: true, ignored: true };
      const row = await D.one("identity_checks", { provider_session: res.session });
      if (!row) throw new Fail(400, "unknown_session");
      if (row.status !== "pending") return { ok: true, duplicate: true };
      const acct = await D.one("accounts", { id: row.account_id });
      const verifiedName = res.status === "verified" ? `${res.first} ${res.last}`.trim() : null;
      if (res.status !== "verified") {
        await D.update("identity_checks", { id: row.id }, { status: "failed" });
        return { ok: true };
      }
      if (!sameName(nameFrom(res.first, res.last), acct.name)) {
        await D.update("identity_checks", { id: row.id }, { status: "name_mismatch", verified_name: verifiedName });
        await exception("name_mismatch", acct.npi, { nppes_name: acct.name, verified_name: verifiedName }, acct.id);
        return { ok: true };
      }
      await D.update("identity_checks", { id: row.id }, { status: "verified", verified_name: verifiedName });
      await D.update("accounts", { id: acct.id }, { status: "verified", verified_method: "identity",
        verified_name: verifiedName, verified_at: iso(now()) });
      await logEdit(acct, "verified", null, { method: "identity" });
      return { ok: true };
    },

    async attest(acct, body) {
      if (acct.status !== "verified") throw new Fail(403, "not_verified");
      if (body.agree !== true) throw new Fail(400, "agree_required");
      const procs = [...new Set((Array.isArray(body.procedures) ? body.procedures : []).filter((p) => PROCS.includes(p)))];
      if (!procs.length) throw new Fail(400, "invalid", { fields: ["procedures"] });
      const prof = await D.one("profiles", { npi: acct.npi });
      const before = prof.attested || [];
      const after = [...new Set([...before, ...procs])].sort();
      for (const p of procs.filter((x) => !before.includes(x)))
        await D.insert("attestations", { account_id: acct.id, npi: acct.npi, procedure: p, statement: ATTEST(p), at: iso(now()) });
      await D.update("profiles", { npi: acct.npi }, { attested: after, updated_at: iso(now()) });
      await logEdit(acct, "attested", before, after);
      return { ok: true, attested: after };
    },
  };
  return svc;
}

// What the export merges into the finder data: verified accounts with at least one attested procedure.
export async function exportConfirmed(b) {
  const out = [];
  for (const a of await b.data.many("accounts", { status: "verified" })) {
    const p = await b.data.one("profiles", { npi: a.npi });
    if (!p || !(p.attested || []).length) continue;
    out.push({ npi: a.npi, name: a.name, procedures: [...p.attested], new_profile: !!p.new_profile,
      photo: p.photo_key || "", insurances: p.insurances || [], insurance_other: p.insurance_other || "",
      insurance_confirm: !!p.insurance_confirm, booking_url: p.booking_url || "", offices: p.offices || [],
      blurbs: p.blurbs || {} });
  }
  return out;
}
