-- Job platform-directory-0007: video visits on profiles, for a database where supabase/schema.sql is already applied.
-- None is applied yet (2026-11-06); keep this and schema.sql in step. Safe to run twice.
alter table profiles add column if not exists telehealth jsonb not null default '{"offers":null,"states":[]}';
alter table profiles drop constraint if exists profiles_telehealth_check;
alter table profiles add constraint profiles_telehealth_check check (jsonb_typeof(telehealth) = 'object'
  and jsonb_typeof(telehealth->'states') = 'array' and jsonb_array_length(telehealth->'states') <= 56
  and coalesce(jsonb_typeof(telehealth->'offers'), 'null') in ('boolean', 'null'));
