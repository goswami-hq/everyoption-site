-- Job platform-directory-0009: the pelvic vein procedure ("pelvic") in attestations, for a database where
-- supabase/schema.sql is already applied. Not applied yet (2026-11-07); until it is, a doctor who adds pelvic vein
-- treatment in an account gets an error. Keep this and schema.sql in step. Safe to run twice.
alter table attestations drop constraint if exists attestations_procedure_check;
alter table attestations add constraint attestations_procedure_check check (procedure in ('ufe', 'pae', 'gae', 'pelvic'));
