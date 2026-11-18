-- Job platform-launch-0011 (his words, HQ chat 2026-11-17 16:24 CT; design yes 16:26 CT): hide my profile.
-- hidden_profiles: one row per hide; shown_at null while it is live (at most one live row per NPI, index below). by_whom
-- "doctor" (the holder's own hide, full access) or "every_option" (his hand edit; the doctor cannot undo it).
-- account_id: the holder when hidden (null for an NPI with no account). reminded_at: the one 6-month reminder.
-- edits.account_id may be null: his hand hide of an NPI with no account still writes its one undoable edits row.
-- Nothing a doctor entered and no sourced tag is changed by a hide. Same as supabase/schema.sql.
create table if not exists hidden_profiles (
  id uuid primary key default gen_random_uuid(),
  npi text not null constraint hidden_profiles_npi_check check (npi ~ '^[0-9]{10}$'),
  by_whom text not null constraint hidden_profiles_by_check check (by_whom in ('doctor', 'every_option')),
  account_id uuid references accounts(id),
  hidden_at timestamptz not null default now(),
  shown_at timestamptz,
  reminded_at timestamptz
);
create unique index if not exists hidden_profiles_one_live on hidden_profiles (npi) where shown_at is null;
alter table hidden_profiles enable row level security;
alter table hidden_profiles force row level security;
revoke all on hidden_profiles from anon, authenticated;
alter table edits alter column account_id drop not null;
