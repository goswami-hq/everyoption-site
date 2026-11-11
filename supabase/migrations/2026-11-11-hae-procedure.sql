-- Job platform-directory-0029: hemorrhoid artery embolization ("hae") in attestations, for a database where
-- supabase/schema.sql is already applied. Not applied yet: until it is, a doctor who adds HAE in an account gets an
-- error. Apply with `scripts/eo_db_apply.py` (ai-hq). Keep this and schema.sql in step. Safe to run twice.
alter table attestations drop constraint if exists attestations_procedure_check;
alter table attestations add constraint attestations_procedure_check check (procedure in ('ufe', 'pae', 'gae', 'pelvic', 'hae'));
