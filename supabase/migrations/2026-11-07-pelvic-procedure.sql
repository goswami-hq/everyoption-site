-- Job platform-directory-0009: the pelvic vein procedure ("pelvic") in attestations, for a database where
-- supabase/schema.sql is already applied. Applied 2026-11-07 by `scripts/eo_db_apply.py` (ai-hq); before that, a doctor who added pelvic vein
-- treatment in an account got an error. Keep this and schema.sql in step. Safe to run twice.
alter table attestations drop constraint if exists attestations_procedure_check;
alter table attestations add constraint attestations_procedure_check check (procedure in ('ufe', 'pae', 'gae', 'pelvic'));
