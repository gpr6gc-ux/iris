-- IRIS Investing — Phase 1 · exchange session calendar and freshness states
-- Applies on top of schema_investing.sql + functions_investing.sql (or the live project). Idempotent.
--
-- Why: every "fresh"/"stale" label was a calendar-day heuristic. Freshness is now defined against the exchange
-- session calendar (XNYS), so a Friday close is LAST_SESSION on Monday pre-open and a missing Monday bar is
-- one session behind after Monday's close — never "fresh" by accident, never "stale" because of a weekend.
--
-- Rollback (bottom of file).

create schema if not exists market;

create table if not exists market.sessions (
  session_date date primary key,
  exchange     text not null default 'XNYS',
  open_at      timestamptz not null,
  close_at     timestamptz not null,
  early_close  boolean not null default false,
  note         text
);
comment on table market.sessions is 'Regular trading sessions of the NYSE (XNYS). Hand-entered from the NYSE published holiday calendar; verify each December for the year after next. Instrument-specific hours (index options, futures) are NOT this table.';

-- Holiday and early-close lists are the NYSE published calendars for 2025–2027 as known on 2026-09-15.
-- 2025-01-09 is the National Day of Mourning (Carter). 2026-07-03 observes Independence Day (July 4 is a Saturday).
-- 2027-06-18 observes Juneteenth, 2027-07-05 Independence Day, 2027-12-24 Christmas (weekend holidays).
create or replace function market.build_sessions(p_from date, p_to date) returns integer
language plpgsql as $$
declare d date := p_from; n int := 0; hol date[]; early date[];
begin
  hol := array[
    '2025-01-01','2025-01-09','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
    '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
    '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24']::date[];
  early := array['2025-07-03','2025-11-28','2025-12-24','2026-11-27','2026-12-24','2027-11-26']::date[];
  while d <= p_to loop
    if extract(isodow from d) < 6 and not (d = any(hol)) then
      insert into market.sessions (session_date, open_at, close_at, early_close)
      values (d,
              (d::text || ' 09:30')::timestamp at time zone 'America/New_York',
              (d::text || case when d = any(early) then ' 13:00' else ' 16:00' end)::timestamp at time zone 'America/New_York',
              d = any(early))
      on conflict (session_date) do update
        set open_at = excluded.open_at, close_at = excluded.close_at, early_close = excluded.early_close;
      n := n + 1;
    end if;
    d := d + 1;
  end loop;
  return n;
end $$;

select market.build_sessions('2025-01-01', '2027-12-31');

-- Latest session whose close is at or before p_at (the "last completed session").
create or replace function market.last_completed_session(p_at timestamptz default now()) returns date
language sql stable as $$ select max(session_date) from market.sessions where close_at <= p_at $$;

-- The session strictly before a calendar date (used for OI business dates).
create or replace function market.prior_session(p_date date) returns date
language sql stable as $$ select max(session_date) from market.sessions where session_date < p_date $$;

-- Open of the next session after p_at.
create or replace function market.next_session_open(p_at timestamptz default now()) returns timestamptz
language sql stable as $$ select min(open_at) from market.sessions where open_at > p_at $$;

-- True while a regular session is in progress at p_at.
create or replace function market.in_session(p_at timestamptz default now()) returns boolean
language sql stable as $$ select exists (select 1 from market.sessions where open_at <= p_at and close_at > p_at) $$;

-- The session p_n sessions after (p_n > 0) or before (p_n < 0) p_date. If p_date is not itself a session, the next
-- session counts as offset 0 for p_n >= 0 and the previous session as offset 0 for p_n < 0.
create or replace function market.session_shift(p_date date, p_n integer) returns date
language sql stable as $$
  select case when p_n >= 0
    then (select session_date from market.sessions where session_date >= p_date order by session_date offset p_n limit 1)
    else (select session_date from market.sessions where session_date <= p_date order by session_date desc offset (-p_n) limit 1)
  end $$;

-- Sessions completed after p_as_of and by p_at: 0 = current, 1 = one behind, ...
create or replace function market.sessions_behind(p_as_of date, p_at timestamptz default now()) returns integer
language sql stable as $$
  select count(*)::int from market.sessions s where s.session_date > p_as_of and s.close_at <= p_at $$;

-- Freshness state of a session-dated (daily) dataset.
--   LAST_SESSION  the newest observation is the last completed session
--   DELAYED       one session behind (the feed normally catches up before the next open)
--   STALE         two or more sessions behind
--   UNAVAILABLE   nothing observed
create or replace function market.daily_state(p_as_of date, p_at timestamptz default now()) returns jsonb
language sql stable as $$
  select case when p_as_of is null then
    jsonb_build_object('state', 'UNAVAILABLE', 'as_of', null, 'sessions_behind', null,
                       'last_completed_session', market.last_completed_session(p_at))
  else jsonb_build_object(
    'as_of', p_as_of,
    'sessions_behind', market.sessions_behind(p_as_of, p_at),
    'state', case market.sessions_behind(p_as_of, p_at) when 0 then 'LAST_SESSION' when 1 then 'DELAYED' else 'STALE' end,
    'last_completed_session', market.last_completed_session(p_at)) end $$;

-- Freshness state of an intraday, provider-delayed dataset (the CBOE chain is 15 minutes delayed by contract).
--   DELAYED       within a session and no older than the provider delay plus a grace period
--   LAST_SESSION  outside session hours and observed during the last completed session
--   STALE         otherwise
--   UNAVAILABLE   nothing observed
-- p_source_as_of is the provider's own timestamp; when it was not recorded the state is computed from received_at and
-- says so in 'basis' rather than pretending receipt time is event time.
create or replace function market.intraday_state(p_source_as_of timestamptz, p_received_at timestamptz,
  p_at timestamptz default now(), p_delay_s integer default 900, p_grace_s integer default 1200) returns jsonb
language sql stable as $$
  with e as (select coalesce(p_source_as_of, p_received_at) as eff,
                    case when p_source_as_of is null then 'received_at (source time not recorded)' else 'source_as_of' end as basis),
       l as (select s.open_at, s.close_at from market.sessions s where s.close_at <= p_at order by s.session_date desc limit 1)
  select case when (select eff from e) is null then jsonb_build_object('state', 'UNAVAILABLE', 'as_of', null)
  else jsonb_build_object(
    'as_of', (select eff from e), 'basis', (select basis from e),
    'age_s', extract(epoch from (p_at - (select eff from e)))::int,
    'provider_delay_s', p_delay_s,
    'state', case
      when market.in_session(p_at) and (p_at - (select eff from e)) <= make_interval(secs => p_delay_s + p_grace_s) then 'DELAYED'
      when not market.in_session(p_at) and (select eff from e) >= (select open_at from l) and (select eff from e) <= (select close_at from l) + make_interval(secs => p_delay_s + p_grace_s) then 'LAST_SESSION'
      else 'STALE' end) end $$;

-- Rollback:
--   drop function market.intraday_state(timestamptz,timestamptz,timestamptz,integer,integer);
--   drop function market.daily_state(date,timestamptz); drop function market.sessions_behind(date,timestamptz);
--   drop function market.session_shift(date,integer); drop function market.in_session(timestamptz);
--   drop function market.next_session_open(timestamptz); drop function market.prior_session(date);
--   drop function market.last_completed_session(timestamptz); drop function market.build_sessions(date,date);
--   drop table market.sessions;
