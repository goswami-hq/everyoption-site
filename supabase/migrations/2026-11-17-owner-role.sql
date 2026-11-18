-- Job platform-launch-0010 (his "1. Yes", HQ chat 2026-11-17 15:12 CT): the owner role and the owner box.
-- accounts.is_owner: at most one account (partial unique index), set only by his hand-edit tool (ai-hq
-- scripts/eo_hand_edit.py owner NPI); the site never sets it. invitations.npi_name: the registry name when the
-- invitation was made, for the invitation lists (no token, no link). Same as supabase/schema.sql.
alter table accounts add column if not exists is_owner boolean not null default false;
create unique index if not exists accounts_one_owner on accounts (is_owner) where is_owner;
alter table invitations add column if not exists npi_name text;
alter table invitations drop constraint if exists invitations_npi_name_check;
alter table invitations add constraint invitations_npi_name_check check (length(npi_name) <= 200);
