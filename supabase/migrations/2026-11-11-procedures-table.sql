-- Procedure registry job 2 of 4 (ai-hq job platform-directory-0033): a procedures table generated from the registry,
-- in place of attestations_procedure_check, for a database where supabase/schema.sql is already applied. Not applied yet.
-- Keep this and schema.sql in step. Safe to run twice.
-- The seed rows below come from content/procedure-keys.json through tools/procedures_sql.py; the build fails if they
-- differ. This file is never edited once applied: a new key gets its own migration (python3 tools/procedures_sql.py --new).
-- Rows are never deleted (on delete restrict); a retired procedure's row is set inactive. The drift check is
-- scripts/eo_db_procedures_check.py (ai-hq).
create table if not exists procedures (
  key text primary key,
  active boolean not null default true,
  added_at timestamptz not null default now()
);
-- BEGIN GENERATED SEED: tools/procedures_sql.py from content/procedure-keys.json. Edit that file, not this block.
insert into procedures (key) values ('ufe'), ('pae'), ('gae'), ('pelvic'), ('hae')
  on conflict (key) do nothing;
-- END GENERATED SEED
-- Row level security as on the other tables: on and forced, no policy, nothing granted to anon or authenticated; only
-- the service role (the Pages Function) and the migration role (postgres), which bypass it, read or write.
alter table procedures enable row level security;
alter table procedures force row level security;
revoke all on procedures from anon, authenticated;
alter table attestations drop constraint if exists attestations_procedure_check;
alter table attestations drop constraint if exists attestations_procedure_fkey;
alter table attestations add constraint attestations_procedure_fkey
  foreign key (procedure) references procedures(key) on delete restrict;
-- PostgREST embeds along foreign keys (lib/accounts/supabase.mjs: accounts(attestations(...))): reload its schema cache.
notify pgrst, 'reload schema';
