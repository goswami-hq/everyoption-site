-- Job platform-web-design-0018: degree and goes-by first name on profiles, for a database where supabase/schema.sql is
-- already applied. Keep this and schema.sql in step. Safe to run twice; adds empty defaults and never rewrites existing data.
-- registry_credential starts null on existing rows: the account page reads the NPI Registry once and fills it.
alter table profiles add column if not exists degree text not null default '';
alter table profiles drop constraint if exists profiles_degree_check;
alter table profiles add constraint profiles_degree_check check (degree in ('', 'MD', 'DO', 'MBBS', 'MBChB', 'MD PhD', 'DO PhD', 'MD MPH', 'MD MBA'));
alter table profiles add column if not exists goes_by text not null default '';
alter table profiles drop constraint if exists profiles_goes_by_check;
alter table profiles add constraint profiles_goes_by_check check (length(goes_by) <= 30);
alter table profiles add column if not exists registry_credential text;
alter table profiles drop constraint if exists profiles_registry_credential_check;
alter table profiles add constraint profiles_registry_credential_check check (length(registry_credential) <= 100);
alter table profiles add column if not exists registry_middle text not null default '';
alter table profiles drop constraint if exists profiles_registry_middle_check;
alter table profiles add constraint profiles_registry_middle_check check (length(registry_middle) <= 60);
