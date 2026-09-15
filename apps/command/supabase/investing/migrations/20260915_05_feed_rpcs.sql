-- IRIS Investing — Phase 1 · worker-lane RPCs the repaired price feed needs
--
--   iris_price_sessions_missing(p_token, p_lookback_sessions, p_limit)
--       Sessions (oldest first) at or before the last completed session that have fewer than p_min_bars bars. The
--       feed asks the database what is missing instead of guessing "today"; the same call drives the backfill.
--   iris_market_refresh(p_token)
--       Runs market.refresh_all() so the compute chain follows a successful price load instead of a fixed clock.
--   iris_feed_state(p_token)
--       The per-dataset freshness block (same as the Investing tab's feeds object) for monitors and the station.
--
-- Rollback (bottom of file).

create or replace function public.iris_price_sessions_missing(p_token text, p_lookback_sessions integer default 260, p_limit integer default 20, p_min_bars integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '30s'
as $function$
declare v_last date; v_from date; v_rows jsonb; v_n int;
begin
  perform brain.check_app_token(p_token);
  v_last := market.last_completed_session(now());
  v_from := market.session_shift(v_last, -greatest(1, coalesce(p_lookback_sessions, 260)));
  with have as (select d, count(*) n from inv.prices where d >= v_from group by d),
       missing as (
         select s.session_date, coalesce(h.n, 0) as bars
           from market.sessions s left join have h on h.d = s.session_date
          where s.session_date between v_from and v_last and coalesce(h.n, 0) < coalesce(p_min_bars, 1000)
          order by s.session_date desc)
  select coalesce(jsonb_agg(jsonb_build_object('d', session_date, 'bars', bars) order by session_date desc), '[]'::jsonb), count(*)
    into v_rows, v_n from (select * from missing limit greatest(1, coalesce(p_limit, 20))) q;
  return jsonb_build_object('ok', true, 'last_completed_session', v_last, 'window_from', v_from,
                            'missing_total', (select count(*) from market.sessions s where s.session_date between v_from and v_last
                                                and coalesce((select count(*) from inv.prices p where p.d = s.session_date), 0) < coalesce(p_min_bars, 1000)),
                            'sessions', v_rows, 'n', v_n,
                            'note', 'newest first; a session counts as loaded at >= ' || coalesce(p_min_bars, 1000) || ' bars');
end $function$;

create or replace function public.iris_market_refresh(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '120s'
as $function$
declare r jsonb; t0 timestamptz := clock_timestamp();
begin
  perform brain.check_app_token(p_token);
  r := market.refresh_all();
  return jsonb_build_object('ok', true, 'refresh', r, 'took_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end $function$;

create or replace function public.iris_feed_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '15s'
as $function$
declare v_prices_session date; v_chain_src timestamptz; v_chain_rcv timestamptz;
begin
  perform brain.check_app_token(p_token);
  select max(d) into v_prices_session from (select d from inv.prices group by d having count(*) >= 1000) q;
  select max(source_as_of), max(received_at) into v_chain_src, v_chain_rcv from market.chain_snapshots;
  return jsonb_build_object('ok', true, 'at', now(),
    'last_completed_session', market.last_completed_session(now()), 'in_session', market.in_session(now()),
    'prices', market.daily_state(v_prices_session, now()),
    'decisions', jsonb_build_object('as_of', (select max(as_of) from market.decisions), 'computed_at', (select max(computed_at) from market.decisions),
                                    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from market.decisions group by status) s)),
    'chains', market.intraday_state(v_chain_src, v_chain_rcv, now(), 900, 1200),
    'macro', market.daily_state((select max(d) from inv.macro), now()));
end $function$;

do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.iris_price_sessions_missing(text,integer,integer,integer) to anon, authenticated, service_role;
    grant execute on function public.iris_market_refresh(text) to anon, authenticated, service_role;
    grant execute on function public.iris_feed_state(text) to anon, authenticated, service_role;
  end if;
end $g$;

-- Rollback:
--   drop function public.iris_feed_state(text); drop function public.iris_market_refresh(text);
--   drop function public.iris_price_sessions_missing(text,integer,integer,integer);
