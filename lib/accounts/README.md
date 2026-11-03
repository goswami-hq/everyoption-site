# Physician accounts (jobs 10, 11 and 22, built; open on the dev site only)

Plan: ai-hq `projects/platform/accounts/plan-2026-11-01.md` and its revision (job 11): 6-digit codes, basic and full
access enforced on the server, invitations with a one-step revoke, automatic takeover by a doctor proven by ID or
Doximity. The work-email check is gone. Nothing here is open: with no configuration every
`/api/account/*` route answers 503 "not open yet" and stores nothing, and the account page says so.

## Files
- `service.mjs`: the rules (stages 1 to 3). `http.mjs`: cookies, origin and type checks, routes. `screen.mjs`: the
  automatic text screen. `image.mjs`: photo checks and metadata stripping. `util.mjs`: names, domains, tokens.
- `local.mjs`: local stand-ins for every outside service (tests and `node tools/dev-server.mjs --accounts`).
- `supabase.mjs`, `vendors.mjs`: the real adapters. `backend.mjs`: picks them from configuration.
- `../../functions/api/account/[[path]].js`: the Pages Function. `../../supabase/schema.sql`: tables and row rules.

## Interfaces (each stand-in and adapter has the same methods)
| Interface | Methods | Local | Real |
| --- | --- | --- | --- |
| data | insert, one, many, update, hit (rate limit), consumeLink (Doximity token), tryCode (code tries), consumeInvite | in memory | Supabase REST + `eo_hit`, `eo_consume_link`, `eo_try_code`, `eo_consume_invite` |
| radiologists | lookup (last name + first initial -> count, NPI when unique) | fixture | table `radiologist_names` |
| photos | put, get | in memory | Supabase Storage, private bucket `photos` |
| email | send | outbox (`/__outbox`) | Resend |
| identity | start, parseResult | simulated page (`/__identity/`) | Stripe Identity (webhook signature checked, session redacted after reading) |
| nppes | lookup | fixture | NPI Registry API (public) |
| listings | get | fixture | the site's own `data/*.json` |
| doximity | authorizeUrl, profile | simulated page (`/__doximity/`) | OAuth at auth.doximity.com, behind `DOXIMITY_ON=yes` |
| geocoder | locate (street, city, state, ZIP -> lat, lon, or null) | fixed table (`geocodes` in the fixture) | U.S. Census geocoder (public, no account), behind `GEOCODER_ON=yes` |

## His commands (no web route)
- `node tools/invite.mjs <NPI>`: his invitation (full access), prints the link. `--published <email>`: basic, to an
  address printed on the doctor's own page (sending it is his email gate). `--dev <url>` runs against the dev server.
- `node tools/revoke-inviter.mjs <NPI or account id>`: the bad inviter and everyone downstream lose full access.

## Connecting (on his yes: ai-hq `ops/approvals/spend/2026-11-01-accounts-services.md`)
1. Supabase: run `supabase/schema.sql`; make the private bucket `photos`; schedule `eo_cleanup()` daily; load the
   radiologist list: `node tools/load-radiologist-names.mjs ~/ai-hq-data/projects/platform/accounts/radiologist-names.json`.
2. Pages variables (encrypted, preview first): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
   `EMAIL_FROM`, then `ACCOUNTS_OPEN=yes`. `STRIPE_SECRET_KEY` and `STRIPE_IDENTITY_WEBHOOK_SECRET` are optional; without both the ID route is off.
3. Stripe webhook to `/api/account/identity/result` for `identity.verification_session.verified` and `.requires_input`.
4. Listings: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/export-confirmed.mjs confirmed.json`, then ai-hq
   `scripts/every_option_export.py --confirmed confirmed.json`, copy to `site/data/`, build, push. Since job 25 edits
   reach patient searches within about a minute through `/api/listings`; the export only refreshes the static fallback.
5. Geocoder: `GEOCODER_ON=yes` (Pages variable). Offices saved before then sit at their ZIP center and are looked
   up again at their next save.
6. Doximity (separate yes): client id and secret, `DOXIMITY_ON=yes`, the `DOXIMITY_*` URLs in `backend.mjs`.

## Offices (job 16)
Up to 5, each with practice, street, city, state, ZIP and phone; a new office needs a street. On save, each new or
changed address is looked up once; unchanged addresses keep their coordinates. No match (or the service down): the
office saves with `geo: "zip"` and the doctor is told; the finder uses its ZIP center. The export carries each office
with `lat`, `lon` and `geo`. The Census geocoder interpolates along street address ranges (not rooftop) and states no
terms or rate limit (read 2026-11-02; ai-hq plan `projects/platform/accounts/plan-2026-11-01.md`).

## Tests
`node --test tools/*.test.mjs`; browser: `tools/e2e/accounts_e2e.py`, `tools/e2e/cards_e2e.py`
(see their headers for the local servers to start).

## Job 22 (2026-11-03): restructure (ai-hq `projects/platform/accounts/restructure-proposal-2026-11-03.md`, Decision)
- Levels: partial (stored as `basic`; email code or published-email invitation) edits procedures, notes, insurance,
  offices, phone and website link, public within about a minute (job 25), and sits in Likely performs. Full (his or a full
  doctor's invitation, ID or Doximity) adds the photo and invitations and moves the card to Confirmed. The export
  carries `confirmed` (full only); ai-hq `merge_confirmed` marks partial cards `from_account`.
- Sign-up asks one yes or no (IR), an email, one agreement; no procedures. Each procedure is added in Your account
  with its own attestation; `POST withdraw` removes one (attestation rows stay).
- `GET search?name=&state=`: our listings plus the NPI Registry by name, physicians only, public fields only.
- `GET photo`: the holder's own photo, `no-store`; `DELETE photo` removes it (no proof needed). The page shrinks phone
  photos in the browser (1600 px, JPEG under 2 MB); the server limit and checks are unchanged.
- No schema change.

## Job 25 (2026-11-03): live listings (his words: "I want live")
- `GET /api/listings?procedure=<key>` (`listings.mjs`, `functions/api/listings.js`): account cards and removals for one
  procedure, public fields only (explicit allow-list), one database request per cache miss (`data.overlay()`:
  profiles with their holder and its attestations), 2-second limit, 60-second cache keyed by the procedure alone,
  its own limit (120 a minute per IP, in memory). The request carries the procedure only, never a ZIP. Accounts not
  connected: an empty overlay.
- `GET /api/photo/<npi>-<id>.<ext>`: a full-access doctor's current photo only; the bucket stays private.
- Removal: `removed` lists NPIs whose current holder attested the procedure and later withdrew it; the finder drops
  them even over a public listing (his yes). Attestation rows untouched; no schema change.
- The finder (`site/assets/finder.js`) merges the overlay over the static file with the export's rules; overlay down
  or slower than 2.5 s: static results, and a late overlay applies to the next search.
- Contact alert: a phone, address or website change on a listing that already existed is recorded (`exceptions`,
  kind `contact_change`) and, with `ALERT_TELEGRAM_TOKEN` and `ALERT_TELEGRAM_CHAT` (and `ALERT_TELEGRAM_TOPIC`) set
  as Pages variables, posted to the Every Option topic. Never holds up the save.
- Local: `node tools/dev-server.mjs --accounts [--listings-down | --listings-slow=<ms>]`; tests
  `tools/listings-job25.test.mjs`, browser `tools/e2e/live_e2e.py`.
