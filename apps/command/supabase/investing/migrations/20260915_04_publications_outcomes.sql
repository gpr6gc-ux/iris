-- IRIS Investing — Phase 1 · immutable signal publications, a fixed benchmark, and a grader that cannot cheat
--
-- market.signals is deleted and re-inserted on every refresh (ids do not survive), so nothing built on signal ids can
-- be graded. This migration adds:
--   * market.signal_publications — append-only: the first time a (symbol, kind, direction) is surfaced, with every
--     input frozen. A signal that keeps being re-emitted is the same publication (market.signal_publication_seen
--     tracks last_seen_at); after 36 h of absence it becomes a new one.
--   * market.benchmarks — SPY is the fixed benchmark for US equities. Missing benchmark bars make an evaluation
--     'benchmark_unavailable'; nothing is substituted.
--   * market.publications — one view over decision and signal publications (what gets graded).
--   * market.outcomes + market.grade_outcomes() — execution at the first close at or after first_eligible_execution_at
--     (never the close the signal was computed from), 5/10/20-session horizons on the exchange calendar, a round-trip
--     cost assumption, direction-signed AR and CAR with explicit definitions, idempotent per (publication, horizon,
--     model_version). Daily closes cannot order intrabar stop/target hits, so path_ambiguous is true and stops are not
--     applied — the grader measures horizon returns only, and says so.
--   * market.outcome_summary() — hit rate with sample count and a Wilson interval, mean net and abnormal returns,
--     and a validation_status that stays 'insufficient' below 30 graded outcomes per horizon.
--
-- Rollback (bottom of file).

create table if not exists market.benchmarks (
  role   text primary key,
  symbol text not null,
  note   text
);
insert into market.benchmarks (role, symbol, note) values
  ('us_equity', 'SPY', 'S&P 500 ETF. Required for AR/CAR; if its bars are missing the outcome is benchmark_unavailable, never substituted.')
on conflict (role) do nothing;

-- First moment a published call could realistically be acted on: 5 minutes after publication if a session is open
-- then, otherwise 5 minutes after the next open. (Processing/decision latency assumption, recorded here once.)
create or replace function market.first_eligible_execution(p_published_at timestamptz) returns timestamptz
language sql stable as $$
  select case when market.in_session(p_published_at + interval '5 minutes') then p_published_at + interval '5 minutes'
              else market.next_session_open(p_published_at) + interval '5 minutes' end $$;

-- ---- signal publications ---------------------------------------------------------------------------------------
create table if not exists market.signal_publications (
  id             bigint generated always as identity primary key,
  symbol         text not null,
  kind           text not null,
  direction      integer not null,          -- -1 short, 0 neutral/structure, 1 long
  dedupe_key     text,
  snapshot_as_of timestamptz not null,      -- effective time of the chain the signal was computed from
  published_at   timestamptz not null,      -- when the signal row was computed (market.signals.created_at)
  first_eligible_execution_at timestamptz not null,
  conviction     numeric, noise_prob numeric, confirmations integer, regime text,
  headline       text, invalidation text,
  evidence       jsonb, factors jsonb, gate_detail jsonb,
  model_version  text not null default 'signals-2026.09.05'
);
create index if not exists signal_publications_symbol_idx on market.signal_publications (symbol, kind, published_at desc);
comment on table market.signal_publications is 'Append-only. One row per first surfacing of (symbol, kind, direction); inputs frozen at publication. The grader evaluates these, never market.signals.';

create table if not exists market.signal_publication_seen (
  publication_id bigint primary key references market.signal_publications(id),
  last_seen_at   timestamptz not null
);

create or replace function market.signal_publications_guard() returns trigger
language plpgsql as $$ begin raise exception 'market.signal_publications is append-only'; end $$;
drop trigger if exists signal_publications_immutable on market.signal_publications;
create trigger signal_publications_immutable before update or delete on market.signal_publications
  for each row execute function market.signal_publications_guard();

create or replace function market.signal_publication_capture() returns trigger
language plpgsql as $$
declare v_pub bigint; v_dir integer; v_seen timestamptz;
begin
  if not coalesce(new.surfaced, false) then return new; end if;
  select p.id, p.direction, s.last_seen_at into v_pub, v_dir, v_seen
    from market.signal_publications p left join market.signal_publication_seen s on s.publication_id = p.id
   where p.symbol = new.symbol and p.kind = new.kind
   order by p.published_at desc, p.id desc limit 1;
  if v_pub is not null and v_dir = coalesce(new.direction, 0) and coalesce(v_seen, '-infinity') >= new.created_at - interval '36 hours' then
    update market.signal_publication_seen set last_seen_at = new.created_at where publication_id = v_pub;
    return new;
  end if;
  insert into market.signal_publications (symbol, kind, direction, dedupe_key, snapshot_as_of, published_at, first_eligible_execution_at,
      conviction, noise_prob, confirmations, regime, headline, invalidation, evidence, factors, gate_detail)
  values (new.symbol, new.kind, coalesce(new.direction, 0), new.dedupe_key, new.as_of, new.created_at,
      market.first_eligible_execution(new.created_at),
      new.conviction, new.noise_prob, new.confirmations, new.regime, new.headline, new.invalidation, new.evidence, new.factors, new.gate_detail)
  returning id into v_pub;
  insert into market.signal_publication_seen (publication_id, last_seen_at) values (v_pub, new.created_at);
  return new;
end $$;
drop trigger if exists signal_publication_capture on market.signals;
create trigger signal_publication_capture after insert on market.signals
  for each row execute function market.signal_publication_capture();

-- ---- one view over everything that can be graded --------------------------------------------------------------
create or replace view market.publications as
  select 'decision'::text as pub_kind, h.id as pub_id, h.symbol,
         case h.direction when 'long' then 1 when 'short' then -1 else 0 end as direction,
         h.published_at, market.first_eligible_execution(h.published_at) as first_eligible_execution_at,
         h.conviction::numeric as conviction, h.model_version
    from market.decision_history h where h.is_publication
  union all
  select 'signal', p.id, p.symbol, p.direction, p.published_at, p.first_eligible_execution_at, p.conviction, p.model_version
    from market.signal_publications p;
comment on view market.publications is 'Every graded unit: decision publications (first surfacing of a direction) and signal publications. Direction 0 rows are structural and are not graded for return.';

-- ---- outcomes -------------------------------------------------------------------------------------------------
create table if not exists market.outcomes (
  pub_kind        text not null,
  pub_id          bigint not null,
  horizon         text not null,             -- '5d' | '10d' | '20d' (exchange sessions)
  grader_version  text not null,
  symbol          text not null,
  direction       integer not null,
  exec_session    date not null, exec_price numeric not null,
  exit_session    date not null, exit_price numeric not null,
  ret_gross       numeric not null,          -- direction x (exit / exec - 1)
  cost_bp         numeric not null,          -- round-trip assumption deducted once
  ret_net         numeric not null,          -- ret_gross - cost_bp / 1e4
  bench_symbol    text not null,
  bench_ret       numeric,                   -- benchmark exit / exec - 1 over the same sessions (unsigned)
  ar              numeric,                   -- direction x (stock return - benchmark return) over the horizon, before costs
  car             numeric,                   -- direction x sum over sessions of (daily stock return - daily benchmark return); null if any bar is missing
  success         boolean,                   -- ret_net > 0; null when the benchmark is unavailable
  path_ambiguous  boolean not null default true,  -- daily closes cannot order intrabar stop/target hits; stops are NOT applied
  state           text not null,             -- graded | benchmark_unavailable
  evaluated_at    timestamptz not null default now(),
  primary key (pub_kind, pub_id, horizon, grader_version)
);
comment on table market.outcomes is 'Graded horizon returns per publication. Immutable per (publication, horizon, grader_version): a new grader definition adds rows, it never overwrites. market.signal_outcomes (older, keyed on non-persistent signal ids) is superseded by this table.';

create or replace function market.grade_outcomes(p_horizons integer[] default array[5,10,20], p_grader_version text default 'grader-2026.09.15')
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '120s'
as $function$
declare v_cost numeric := coalesce(market.param('grader.cost_bp_round_trip', '10')::numeric, 10);
        v_bench text := (select symbol from market.benchmarks where role = 'us_equity');
        v_last date := market.last_completed_session(now());
        n_graded int := 0; n_nobench int := 0; n_pending int := 0;
begin
  with pubs as (
    select * from market.publications where direction in (-1, 1)
  ),
  hz as (select unnest(p_horizons) as h),
  ex as (
    select p.*, hz.h,
           (select min(s.session_date) from market.sessions s where s.close_at >= p.first_eligible_execution_at) as exec_session
    from pubs p cross join hz
  ),
  ex2 as (select ex.*, market.session_shift(ex.exec_session, ex.h) as exit_session from ex),
  due as (select * from ex2 where exit_session is not null and exit_session <= v_last),
  priced as (
    select d.*,
           pe.close as exec_price, px.close as exit_price, be.close as bench_exec, bx.close as bench_exit
      from due d
      left join inv.prices pe on pe.ticker = d.symbol and pe.d = d.exec_session
      left join inv.prices px on px.ticker = d.symbol and px.d = d.exit_session
      left join inv.prices be on be.ticker = v_bench and be.d = d.exec_session
      left join inv.prices bx on bx.ticker = v_bench and bx.d = d.exit_session
  ),
  car as (
    -- daily abnormal returns over the window; null unless every session has both bars
    select p.pub_kind, p.pub_id, p.h,
           case when count(*) = count(sp.close) and count(*) = count(bp.close) and count(*) = count(sp0.close) and count(*) = count(bp0.close)
                then sum(p.direction * ((sp.close / sp0.close - 1) - (bp.close / bp0.close - 1))) end as car
      from priced p
      join market.sessions s on s.session_date > p.exec_session and s.session_date <= p.exit_session
      left join inv.prices sp  on sp.ticker  = p.symbol and sp.d  = s.session_date
      left join inv.prices sp0 on sp0.ticker = p.symbol and sp0.d = market.session_shift(s.session_date, -1)
      left join inv.prices bp  on bp.ticker  = v_bench  and bp.d  = s.session_date
      left join inv.prices bp0 on bp0.ticker = v_bench  and bp0.d = market.session_shift(s.session_date, -1)
     where p.exec_price is not null and p.exit_price is not null
     group by p.pub_kind, p.pub_id, p.h
  ),
  ins as (
    insert into market.outcomes (pub_kind, pub_id, horizon, grader_version, symbol, direction, exec_session, exec_price, exit_session, exit_price,
                                 ret_gross, cost_bp, ret_net, bench_symbol, bench_ret, ar, car, success, path_ambiguous, state)
    select p.pub_kind, p.pub_id, p.h || 'd', p_grader_version, p.symbol, p.direction, p.exec_session, p.exec_price, p.exit_session, p.exit_price,
           p.direction * (p.exit_price / p.exec_price - 1),
           v_cost,
           p.direction * (p.exit_price / p.exec_price - 1) - v_cost / 10000.0,
           v_bench,
           case when p.bench_exec is not null and p.bench_exit is not null then p.bench_exit / p.bench_exec - 1 end,
           case when p.bench_exec is not null and p.bench_exit is not null then p.direction * ((p.exit_price / p.exec_price - 1) - (p.bench_exit / p.bench_exec - 1)) end,
           c.car,
           case when p.bench_exec is not null and p.bench_exit is not null then (p.direction * (p.exit_price / p.exec_price - 1) - v_cost / 10000.0) > 0 end,
           true,
           case when p.bench_exec is not null and p.bench_exit is not null then 'graded' else 'benchmark_unavailable' end
      from priced p left join car c on c.pub_kind = p.pub_kind and c.pub_id = p.pub_id and c.h = p.h
     where p.exec_price is not null and p.exit_price is not null and p.exec_price > 0
    on conflict (pub_kind, pub_id, horizon, grader_version) do nothing
    returning state
  )
  select count(*) filter (where state = 'graded'), count(*) filter (where state = 'benchmark_unavailable') into n_graded, n_nobench from ins;

  select count(*) into n_pending from (
    select 1 from market.publications p cross join unnest(p_horizons) h
     where p.direction in (-1, 1)
       and coalesce(market.session_shift((select min(s.session_date) from market.sessions s where s.close_at >= p.first_eligible_execution_at), h), 'infinity'::date) > v_last) q;

  return jsonb_build_object('graded', n_graded, 'benchmark_unavailable', n_nobench, 'not_yet_due', n_pending,
                            'grader_version', p_grader_version, 'benchmark', v_bench, 'cost_bp_round_trip', v_cost,
                            'execution_rule', 'first close at or after first_eligible_execution_at (5 min after publication, or after the next open); daily closes only, stops not applied (path_ambiguous)');
end $function$;

-- Wilson 95% interval for a hit rate; validation_status is honest about sample size.
create or replace function market.outcome_summary(p_pub_kind text default null, p_grader_version text default 'grader-2026.09.15') returns jsonb
language sql stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
  with o as (
    select * from market.outcomes where grader_version = p_grader_version and state = 'graded'
       and (p_pub_kind is null or pub_kind = p_pub_kind)
  ),
  agg as (
    select horizon, count(*) n,
           avg(case when success then 1 else 0 end)::numeric as hit,
           avg(ret_net) as mean_ret_net, percentile_cont(0.5) within group (order by ret_net) as median_ret_net,
           avg(ar) as mean_ar, avg(car) filter (where car is not null) as mean_car,
           count(*) filter (where direction = 1) as n_long, count(*) filter (where direction = -1) as n_short,
           avg(ret_net) filter (where direction = 1) as mean_ret_net_long, avg(ret_net) filter (where direction = -1) as mean_ret_net_short
    from o group by horizon
  )
  select jsonb_build_object(
    'grader_version', p_grader_version,
    'pub_kind', coalesce(p_pub_kind, 'all'),
    'horizons', coalesce((select jsonb_object_agg(horizon, jsonb_build_object(
        'n', n, 'hit_rate', round(hit, 3),
        'hit_rate_ci95', case when n > 0 then jsonb_build_array(
            round((hit + 1.96*1.96/(2*n) - 1.96*sqrt((hit*(1-hit) + 1.96*1.96/(4*n))/n)) / (1 + 1.96*1.96/n), 3),
            round((hit + 1.96*1.96/(2*n) + 1.96*sqrt((hit*(1-hit) + 1.96*1.96/(4*n))/n)) / (1 + 1.96*1.96/n), 3)) end,
        'mean_ret_net', round(mean_ret_net, 4), 'median_ret_net', round(median_ret_net::numeric, 4),
        'mean_ar', round(mean_ar, 4), 'mean_car', round(mean_car, 4),
        'n_long', n_long, 'n_short', n_short,
        'mean_ret_net_long', round(mean_ret_net_long, 4), 'mean_ret_net_short', round(mean_ret_net_short, 4),
        'validation_status', case when n < 30 then 'insufficient (n < 30)' when n < 100 then 'preliminary (n < 100)' else 'sample adequate for a first read' end))
      from agg), '{}'::jsonb),
    'definitions', jsonb_build_object(
        'ret_net', 'direction x (exit close / execution close - 1) - round-trip cost; execution = first close at or after eligibility',
        'ar', 'direction x (stock return - SPY return) over the horizon, before costs',
        'car', 'direction x sum of daily (stock return - SPY return) over the horizon sessions; null if any bar is missing',
        'success', 'ret_net > 0',
        'hit_rate_ci95', 'Wilson score interval',
        'caveat', 'heuristic scores are not probabilities; outcomes below n=30 per horizon are not evidence of anything'));
$$;

-- Rollback:
--   drop function market.outcome_summary(text,text); drop function market.grade_outcomes(integer[],text);
--   drop table market.outcomes; drop view market.publications;
--   drop trigger signal_publication_capture on market.signals; drop function market.signal_publication_capture();
--   drop trigger signal_publications_immutable on market.signal_publications; drop function market.signal_publications_guard();
--   drop table market.signal_publication_seen; drop table market.signal_publications;
--   drop function market.first_eligible_execution(timestamptz); drop table market.benchmarks;
