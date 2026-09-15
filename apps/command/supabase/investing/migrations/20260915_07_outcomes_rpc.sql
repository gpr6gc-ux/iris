-- IRIS Investing — Phase 1/5 · owner+member RPC for graded outcomes (the drill-down's "Comparable outcomes")
--
--   iris2_investing_outcomes(p_symbol) → { summary (market.outcome_summary for decisions), pending, symbol_outcomes[] }
-- Scope: investing (owners and invited members). Never raises to the client.
-- Rollback: drop function public.iris2_investing_outcomes(text);

create or replace function public.iris2_investing_outcomes(p_symbol text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'pg_temp'
 set statement_timeout to '8s'
as $function$
declare t0 timestamptz := clock_timestamp(); v_sym text := upper(trim(coalesce(p_symbol, '')));
        v_last date := market.last_completed_session(now());
begin
  perform brain.require_scope('investing');
  return iris2._ok(jsonb_build_object(
    'summary', market.outcome_summary('decision'),
    'signals_summary', market.outcome_summary('signal'),
    'pending', (select count(*) from market.publications p
                 where p.direction in (-1, 1)
                   and not exists (select 1 from market.outcomes o where o.pub_kind = p.pub_kind and o.pub_id = p.pub_id and o.horizon = '5d')),
    'publications', (select count(*) from market.publications where direction in (-1, 1)),
    'graded', (select count(*) from market.outcomes where state = 'graded'),
    'benchmark_unavailable', (select count(*) from market.outcomes where state = 'benchmark_unavailable'),
    'last_completed_session', v_last,
    'symbol_outcomes', case when v_sym = '' then '[]'::jsonb else
        (select coalesce(jsonb_agg(jsonb_build_object('pub_kind', o.pub_kind, 'horizon', o.horizon, 'direction', o.direction,
              'exec_session', o.exec_session, 'exec_price', o.exec_price, 'exit_session', o.exit_session, 'exit_price', o.exit_price,
              'ret_net', round(o.ret_net, 4), 'ar', round(o.ar, 4), 'success', o.success, 'state', o.state) order by o.exec_session desc, o.horizon), '[]'::jsonb)
           from market.outcomes o where o.symbol = v_sym and o.grader_version = 'grader-2026.09.15') end,
    'symbol_publications', case when v_sym = '' then '[]'::jsonb else
        (select coalesce(jsonb_agg(jsonb_build_object('pub_kind', p.pub_kind, 'direction', p.direction, 'published_at', p.published_at,
              'first_eligible_execution_at', p.first_eligible_execution_at, 'conviction', p.conviction) order by p.published_at desc), '[]'::jsonb)
           from (select * from market.publications where symbol = v_sym and direction in (-1, 1) order by published_at desc limit 20) p) end
  ), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$;

do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.iris2_investing_outcomes(text) from public, anon;
    grant execute on function public.iris2_investing_outcomes(text) to authenticated, service_role;
  end if;
end $g$;
