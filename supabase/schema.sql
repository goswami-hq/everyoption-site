-- Every Option physician accounts: Supabase (Postgres) schema. Not applied anywhere yet (no account exists).
-- Job 11 (2026-11-01): codes, invitations, levels, takeover; the email-domain check and its column are gone.
-- Apply once in the Supabase SQL editor when he says connect; then set the variables in lib/accounts/backend.mjs.
--
-- Access model: only the Pages Function talks to the database, with the service-role key (server side, an encrypted
-- Pages variable). Row level security is ON for every table with no policy for anon or authenticated, so the public
-- anon key, if it ever leaked, reads and writes nothing. "A user edits only their own profile" is enforced in
-- lib/accounts/service.mjs (every write keyed by the signed-in account's NPI) and backed here by the triggers below.
-- Physician data only: no table or column holds patient information.

create extension if not exists pgcrypto;

create table accounts (
  id uuid primary key default gen_random_uuid(),
  npi text unique check (npi ~ '^[0-9]{10}$'),                      -- one account per NPI; null: none held (yet)
  claim_npi text check (claim_npi ~ '^[0-9]{10}$'),                  -- an NPI held by another account, waiting on proof
  claim_procedures jsonb not null default '[]',                      -- what the claimant ticked; attested at takeover
  lost_npi text,                                                     -- the NPI a proven doctor took over from it
  email text unique check (length(email) <= 200),                    -- login email; null until added (invitations)
  name text not null,                                                -- from NPPES, never typed by the user
  first_name text not null default '',
  last_name text not null default '',
  taxonomy text not null default '',
  level text not null default 'basic' check (level in ('none', 'basic', 'full')),
  proof text check (proof in ('email_code', 'invite_published', 'invite_owner', 'invite_doctor', 'doximity', 'identity', 'revoked')),
  proof_name text,                                                   -- identity check or Doximity: the name only, no images
  proof_at timestamptz,
  invited_by uuid,                                                   -- the invitation it came in on (invitations.id)
  invite_banned boolean not null default false,                      -- revoked inviter, or downstream of one
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  doximity_id text unique,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  npi text not null unique check (npi ~ '^[0-9]{10}$'),              -- the listing; its holder can change (takeover)
  account_id uuid not null references accounts(id),
  new_profile boolean not null default false,
  photo_key text,
  insurances jsonb not null default '[]',
  insurance_other text not null default '' check (length(insurance_other) <= 100),
  insurance_confirm boolean not null default false,
  booking_url text not null default '' check (length(booking_url) <= 300),
  offices jsonb not null default '[]',
  blurbs jsonb not null default '{}',
  attested jsonb not null default '[]',
  -- job platform-directory-0007: video visits; offers true, false or null (not answered); states: two-letter codes.
  -- The service checks the codes; the database keeps the shape. Same as supabase/migrations/2026-11-06-telehealth.sql.
  telehealth jsonb not null default '{"offers":null,"states":[]}' check (jsonb_typeof(telehealth) = 'object'
    and jsonb_typeof(telehealth->'states') = 'array' and jsonb_array_length(telehealth->'states') <= 56
    and coalesce(jsonb_typeof(telehealth->'offers'), 'null') in ('boolean', 'null')),
  updated_at timestamptz not null default now()
);

create table login_links (                                           -- Doximity linking tokens only (sign-in is by code)
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,                                   -- sha-256 of the token; the token is only in the browser
  purpose text not null check (purpose in ('doximity')),
  email text not null default '',
  payload jsonb not null default '{}',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table codes (                                                  -- 6-digit codes: sign-up, sign-in, email change
  id uuid primary key default gen_random_uuid(),
  challenge_hash text not null unique,                               -- sha-256 of the challenge the browser holds
  purpose text not null check (purpose in ('signup', 'claim', 'login', 'email_change')),
  email text not null,
  code_hash text not null,                                           -- sha-256 of the code salted with the challenge
  payload jsonb not null default '{}',
  tries integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table invitations (                                            -- one NPI, one use, 7 days; inviter recorded
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  npi text not null check (npi ~ '^[0-9]{10}$'),
  kind text not null check (kind in ('owner', 'doctor', 'published')),
  inviter_account_id uuid references accounts(id),                   -- null for his own invitations
  slot integer check (slot between 1 and 5),                         -- a doctor's invitations: 5 for life, atomically
  email text,                                                        -- published-email invitations only
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references accounts(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (inviter_account_id, slot),
  check ((kind = 'doctor') = (inviter_account_id is not null) and (kind <> 'doctor' or slot is not null))
);

create table radiologist_names (                                      -- national list: last name + first initial
  name_key text primary key,
  n integer not null,
  npi text                                                           -- only when n = 1
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  account_id uuid not null references accounts(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table identity_checks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  provider_session text not null unique,
  status text not null check (status in ('pending', 'verified', 'failed', 'name_mismatch', 'name_review', 'cancelled')),
  verified_name text,
  at timestamptz not null default now()
);

create table attestations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  npi text not null,
  procedure text not null check (procedure in ('ufe', 'pae', 'gae', 'pelvic', 'hae')),
  statement text not null,                                           -- the exact wording ticked
  agreement text not null default '',                                -- the one agreement on the page
  at timestamptz not null default now()
);

create table edits (                                                  -- every change, kept; undo adds a row
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  npi text not null,
  field text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now(),
  undo_of uuid references edits(id),
  undone_by uuid references edits(id)
);

create table exceptions (                                             -- the only list that reaches him
  id uuid primary key default gen_random_uuid(),
  kind text not null,                                                 -- dispute, invite_npi_held, inviter_revoked, name_mismatch, redact_failed, email_cap, doximity_name_mismatch
  npi text not null,
  account_id uuid references accounts(id),
  detail jsonb not null default '{}',
  at timestamptz not null default now(),
  resolved_at timestamptz
);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  npi text not null,
  email text not null,
  name text not null,
  taxonomy text not null,
  taxonomy_desc text not null default '',
  at timestamptz not null default now()
);

create table rate_hits (
  key text not null,
  window_start bigint not null,                                      -- epoch seconds at the window's start
  n integer not null default 0,
  primary key (key, window_start)
);

-- Row level security: on everywhere, no policies, so only the service role gets in.
do $$ declare t text; begin
  foreach t in array array['accounts','profiles','login_links','codes','invitations','radiologist_names','sessions',
                           'identity_checks','attestations','edits','exceptions','waitlist','rate_hits'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

-- Append-only: attestations and edits never change or disappear (undo writes a new edit; only undone_by is set once).
create function eo_no_rewrite() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'append-only'; end if;
  if tg_table_name = 'edits' and old.undone_by is null and new.undone_by is not null
     and (new.before, new.after, new.field, new.npi, new.at) is not distinct from (old.before, old.after, old.field, old.npi, old.at)
  then return new; end if;
  raise exception 'append-only';
end $$;
create trigger attestations_append before update or delete on attestations for each row execute function eo_no_rewrite();
create trigger edits_append before update or delete on edits for each row execute function eo_no_rewrite();

-- A profile row stays on its NPI. Its holder changes only to an account that now holds that NPI (takeover, invitation).
create function eo_profile_owner() returns trigger language plpgsql as $$
begin
  if new.npi <> old.npi then raise exception 'profile npi is fixed'; end if;
  if new.account_id <> old.account_id and not exists (select 1 from accounts where id = new.account_id and npi = new.npi)
  then raise exception 'profile holder must hold the npi'; end if;
  return new;
end $$;
create trigger profiles_owner before update on profiles for each row execute function eo_profile_owner();

-- Rate limit: one fixed-window counter, atomically; true while under p_max.
create function eo_hit(p_key text, p_window integer, p_max integer) returns boolean language sql security definer
set search_path = public as $$
  insert into rate_hits (key, window_start, n) values (p_key, (floor(extract(epoch from now()) / p_window) * p_window)::bigint, 1)
  on conflict (key, window_start) do update set n = rate_hits.n + 1
  returning n <= p_max;
$$;

-- A link works once and only before it expires: mark used and return it in one statement.
create function eo_consume_link(p_hash text) returns setof login_links language sql security definer
set search_path = public as $$
  update login_links set used_at = now()
  where token_hash = p_hash and used_at is null and expires_at > now()
  returning *;
$$;

-- A code try: counted, and only while unused, unexpired and under p_max tries; a match marks it used and returns it.
create function eo_try_code(p_challenge text, p_code text, p_max integer) returns setof codes language plpgsql
security definer set search_path = public as $$
declare r codes;
begin
  update codes set tries = tries + 1
  where challenge_hash = p_challenge and used_at is null and expires_at > now() and tries < p_max
  returning * into r;
  if r.id is null or r.code_hash <> p_code then return; end if;
  update codes set used_at = now() where id = r.id returning * into r;
  return next r;
end $$;

-- An invitation works once, before it expires, unless revoked.
create function eo_consume_invite(p_hash text) returns setof invitations language sql security definer
set search_path = public as $$
  update invitations set used_at = now()
  where token_hash = p_hash and used_at is null and revoked_at is null and expires_at > now()
  returning *;
$$;

revoke all on function eo_hit(text, integer, integer), eo_consume_link(text), eo_try_code(text, text, integer),
  eo_consume_invite(text) from public, anon, authenticated;

-- Housekeeping (run daily with pg_cron when connected): expired links and sessions and old rate windows go.
create function eo_cleanup() returns void language sql security definer set search_path = public as $$
  delete from login_links where expires_at < now() - interval '1 day';
  delete from codes where expires_at < now() - interval '1 day';
  delete from sessions where expires_at < now() - interval '1 day';
  delete from rate_hits where window_start < extract(epoch from now())::bigint - 2 * 86400;
$$;
revoke all on function eo_cleanup() from public, anon, authenticated;

-- Photos: a private Storage bucket "photos" (created in the dashboard), 1 MB cap, image/jpeg, image/png, image/webp.
-- The export copies published photos into the static site, so the public site never reads Supabase.
