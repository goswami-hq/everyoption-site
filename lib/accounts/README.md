# Physician accounts (jobs 10 and 11, built, not live)

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

## His commands (no web route)
- `node tools/invite.mjs <NPI>`: his invitation (full access), prints the link. `--published <email>`: basic, to an
  address printed on the doctor's own page (sending it is his email gate). `--dev <url>` runs against the dev server.
- `node tools/revoke-inviter.mjs <NPI or account id>`: the bad inviter and everyone downstream lose full access.

## Connecting (on his yes: ai-hq `ops/approvals/spend/2026-11-01-accounts-services.md`)
1. Supabase: run `supabase/schema.sql`; make the private bucket `photos`; schedule `eo_cleanup()` daily; load the
   radiologist list: `node tools/load-radiologist-names.mjs ~/ai-hq-data/projects/platform/accounts/radiologist-names.json`.
2. Pages variables (encrypted, preview first): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
   `EMAIL_FROM`, `STRIPE_SECRET_KEY`, `STRIPE_IDENTITY_WEBHOOK_SECRET`, then `ACCOUNTS_OPEN=yes`.
3. Stripe webhook to `/api/account/identity/result` for `identity.verification_session.verified` and `.requires_input`.
4. Listings: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/export-confirmed.mjs confirmed.json`, then ai-hq
   `scripts/every_option_export.py --confirmed confirmed.json`, copy to `site/data/`, build, push. Edits reach the
   public cards at each such export (the finder stays static).
5. Doximity (separate yes): client id and secret, `DOXIMITY_ON=yes`, the `DOXIMITY_*` URLs in `backend.mjs`.

## Tests
`node --test tools/*.test.mjs`; browser: `tools/e2e/accounts_e2e.py`, `tools/e2e/cards_e2e.py`
(see their headers for the local servers to start).
