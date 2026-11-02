-- Every Option physician accounts: Supabase (Postgres) schema. Not applied anywhere yet (no account exists).
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
  npi text not null unique check (npi ~ '^[0-9]{10}$'),            -- one account per NPI
  email text not null unique check (length(email) <= 200),
  name text not null,                                                -- from NPPES, never typed by the user
  taxonomy text not null default '',
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  verified_method text check (verified_method in ('work_email', 'identity')),
  verified_name text,                                                -- identity check: the name only, no images
  verified_at timestamptz,
  work_email text,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  doximity_id text unique,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  npi text not null unique references accounts(npi),
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
  updated_at timestamptz not null default now()
);

create table login_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,                                   -- sha-256 of the token; the token is only in the email
  purpose text not null check (purpose in ('signup', 'login', 'work_email', 'doximity')),
  email text not null default '',
  payload jsonb not null default '{}',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
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
  status text not null check (status in ('pending', 'verified', 'failed', 'name_mismatch')),
  verified_name text,
  at timestamptz not null default now()
);

create table attestations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  npi text not null,
  procedure text not null check (procedure in ('ufe', 'pae', 'gae')),
  statement text not null,                                           -- the exact wording ticked
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
  kind text not null,                                                 -- second_claimant, name_mismatch, doximity_name_mismatch
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
  foreach t in array array['accounts','profiles','login_links','sessions','identity_checks','attestations','edits',
                           'exceptions','waitlist','rate_hits'] loop
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

-- A profile row stays with its account's NPI.
create function eo_profile_owner() returns trigger language plpgsql as $$
begin
  if new.npi <> old.npi or new.account_id <> old.account_id then raise exception 'profile owner is fixed'; end if;
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

revoke all on function eo_hit(text, integer, integer), eo_consume_link(text) from public, anon, authenticated;

-- Housekeeping (run daily with pg_cron when connected): expired links and sessions and old rate windows go.
create function eo_cleanup() returns void language sql security definer set search_path = public as $$
  delete from login_links where expires_at < now() - interval '1 day';
  delete from sessions where expires_at < now() - interval '1 day';
  delete from rate_hits where window_start < extract(epoch from now())::bigint - 2 * 86400;
$$;
revoke all on function eo_cleanup() from public, anon, authenticated;

-- Photos: a private Storage bucket "photos" (created in the dashboard), 1 MB cap, image/jpeg, image/png, image/webp.
-- The export copies published photos into the static site, so the public site never reads Supabase.
