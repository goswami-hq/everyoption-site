-- Job platform-directory-0036: procedures a doctor performs that are not on the site yet, for a database where
-- supabase/schema.sql is already applied. Private: never in the public overlay, the export or any page. Not applied yet.
-- Keep this and schema.sql in step. Safe to run twice; adds empty defaults and never rewrites existing data.
alter table profiles add column if not exists also_performs jsonb not null default '[]';
alter table profiles drop constraint if exists profiles_also_performs_check;
alter table profiles add constraint profiles_also_performs_check check (jsonb_typeof(also_performs) = 'array'
  and jsonb_array_length(also_performs) <= 100);
alter table profiles add column if not exists also_performs_other text not null default '';
alter table profiles drop constraint if exists profiles_also_performs_other_check;
alter table profiles add constraint profiles_also_performs_other_check check (length(also_performs_other) <= 120);
