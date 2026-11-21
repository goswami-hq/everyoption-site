-- Doctor-contact taps (his words, ai-hq HQ chat 2026-11-21 09:08 CT: "Let's build 2 first", item 2 of the marketing
-- plan of action: count when a patient taps to call or visit a doctor). Keep this and schema.sql in step. Safe to run twice.
-- One row per day, doctor, procedure, kind of tap and page type, holding a count. Nothing about the visitor is stored:
-- no internet address, no cookie, no device detail, no time finer than the day. The per-connection limit lives in
-- rate_hits (hashed key, deleted within 2 days by eo_cleanup), as for error reports.
create table if not exists contact_taps (
  day date not null,
  npi text not null constraint contact_taps_npi_check check (npi ~ '^[0-9]{10}$'),
  proc text not null default '' constraint contact_taps_proc_check check (proc = '' or proc ~ '^[a-z]{2,12}$'),
  kind text not null constraint contact_taps_kind_check check (kind in ('call', 'website', 'booking')),
  src text not null constraint contact_taps_src_check check (src in ('finder', 'city', 'profile')),
  n integer not null default 0,
  primary key (day, npi, proc, kind, src)
);
alter table contact_taps enable row level security;
alter table contact_taps force row level security;
revoke all on contact_taps from anon, authenticated;

-- One tap: add 1 in one statement, so parallel taps cannot lose a count. The day is the server's UTC date.
create or replace function eo_tap(p_npi text, p_proc text, p_kind text, p_src text) returns void language sql
security definer set search_path = public as $$
  insert into contact_taps (day, npi, proc, kind, src, n) values ((now() at time zone 'utc')::date, p_npi, p_proc, p_kind, p_src, 1)
  on conflict (day, npi, proc, kind, src) do update set n = contact_taps.n + 1;
$$;
revoke all on function eo_tap(text, text, text, text) from public, anon, authenticated;
