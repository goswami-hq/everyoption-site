-- Job platform-launch-0009 (his yes, HQ chat 2026-11-17 12:41 CT): invitations, for a database where
-- supabase/schema.sql is already applied. Keep this and schema.sql in step. Safe to run twice; rewrites no data.
-- 1. Only used and live (unused, unrevoked, unexpired) invitations count toward a doctor's limit; an expired or
--    withdrawn unused link frees its slot. The old unique (inviter, slot 1-5) key counted every row ever made, so it
--    goes; the cap now holds in eo_insert_doctor_invite, which locks the inviter's account row, counts and inserts in
--    one step (parallel requests for one inviter run one after another). slot stays as the count at creation (1-50).
-- 2. accounts.invite_limit: one doctor's raised limit (null = 5; 0 to 50), set only by his hand-edit tool.
-- 3. codes.purpose 'invite': accepting any invitation asks for a login email and its 6-digit code.
alter table invitations drop constraint if exists invitations_inviter_account_id_slot_key;
alter table invitations drop constraint if exists invitations_slot_check;
alter table invitations add constraint invitations_slot_check check (slot between 1 and 50);
alter table accounts add column if not exists invite_limit integer;
alter table accounts drop constraint if exists accounts_invite_limit_check;
alter table accounts add constraint accounts_invite_limit_check check (invite_limit between 0 and 50);
alter table codes drop constraint if exists codes_purpose_check;
alter table codes add constraint codes_purpose_check check (purpose in ('signup', 'claim', 'login', 'email_change', 'invite'));
create index if not exists invitations_inviter_idx on invitations (inviter_account_id);

create or replace function eo_insert_doctor_invite(p_token_hash text, p_npi text, p_inviter uuid, p_expires_at timestamptz)
returns setof invitations language plpgsql security definer set search_path = public as $$
declare lim integer; n integer; r invitations;
begin
  select coalesce(invite_limit, 5) into lim from accounts where id = p_inviter for update;
  if not found then return; end if;
  select count(*) into n from invitations where inviter_account_id = p_inviter
    and (used_at is not null or (revoked_at is null and expires_at > now()));
  if n >= lim then return; end if;
  insert into invitations (token_hash, npi, kind, inviter_account_id, slot, expires_at)
    values (p_token_hash, p_npi, 'doctor', p_inviter, n + 1, p_expires_at) returning * into r;
  return next r;
end $$;
revoke all on function eo_insert_doctor_invite(text, text, uuid, timestamptz) from public, anon, authenticated;
