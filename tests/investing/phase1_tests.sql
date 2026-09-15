-- IRIS Investing — Phase 1 acceptance tests. Runs inside one transaction and rolls back: nothing persists.
-- Usage: psql -d iris_local -v ON_ERROR_STOP=1 -f tests/investing/phase1_tests.sql   (see tests/investing/run.sh)
-- Every block raises on failure and emits "PASS Tnn" on success. Ids refer to the acceptance list in the
-- implementation prompt (§14) and investing/CHECKPOINT.md.

begin;
set local client_min_messages = notice;

-- T01 · a September 10 observation ingested on September 14 remains dated September 10 (event time survives ingest)
do $$
declare d date;
begin
  perform public.iris_inv_prices_bulk('local-dev-token', '[{"ticker":"TEST1","d":"2026-09-10","close":10.5,"volume":100}]'::jsonb);
  select p.d into d from inv.prices p where p.ticker = 'TEST1';
  if d <> '2026-09-10' then raise exception 'T01 FAIL: bar dated % (expected 2026-09-10)', d; end if;
  raise notice 'PASS T01 event date preserved through ingest';
end $$;

-- T02 · a valid prior-session close viewed before the next session's close is LAST_SESSION, never LIVE;
--       after the next close it is DELAYED (one session behind); two later it is STALE
do $$
begin
  if market.daily_state('2026-09-11', '2026-09-14 09:00-04')->>'state' <> 'LAST_SESSION' then raise exception 'T02 FAIL pre-open'; end if;
  if market.daily_state('2026-09-11', '2026-09-14 15:59-04')->>'state' <> 'LAST_SESSION' then raise exception 'T02 FAIL intraday'; end if;
  if market.daily_state('2026-09-11', '2026-09-14 16:00-04')->>'state' <> 'DELAYED' then raise exception 'T02 FAIL after close'; end if;
  if market.daily_state('2026-09-11', '2026-09-15 16:30-04')->>'state' <> 'STALE' then raise exception 'T02 FAIL two behind'; end if;
  if market.daily_state(null, now())->>'state' <> 'UNAVAILABLE' then raise exception 'T02 FAIL unavailable'; end if;
  -- the Labor Day weekend: Friday 4 Sep is LAST_SESSION all of Monday 7 Sep (holiday) and Tuesday 8 Sep until the close
  if market.daily_state('2026-09-04', '2026-09-07 12:00-04')->>'state' <> 'LAST_SESSION' then raise exception 'T02 FAIL holiday'; end if;
  if market.daily_state('2026-09-04', '2026-09-08 12:00-04')->>'state' <> 'LAST_SESSION' then raise exception 'T02 FAIL tuesday intraday'; end if;
  if market.daily_state('2026-09-04', '2026-09-08 16:01-04')->>'state' <> 'DELAYED' then raise exception 'T02 FAIL tuesday close'; end if;
  raise notice 'PASS T02 LAST_SESSION / DELAYED / STALE follow the session calendar';
end $$;

-- T03 · a fresh chain snapshot cannot imply intraday OI: the OI business date is always the prior session; and the
--       snapshot's own state is computed from the provider time when it exists, else says the basis is receipt time
do $$
declare r market.chain_snapshots%rowtype; st jsonb;
begin
  perform public.iris_positioning_ingest('local-dev-token', 'SPY', '2026-09-14 14:00:07-04', 650.0,
     '[{"e":"2026-10-16","k":650,"coi":100,"poi":100,"cg":0.01,"pg":0.01}]'::jsonb, '2026-09-14 13:45:00-04');
  select * into r from market.chain_snapshots where symbol = 'SPY' order by received_at desc limit 1;
  if r.oi_business_date <> '2026-09-11' then raise exception 'T03 FAIL oi_business_date % (expected 2026-09-11)', r.oi_business_date; end if;
  if r.as_of <> '2026-09-14 13:45:00-04'::timestamptz then raise exception 'T03 FAIL as_of should be the provider time'; end if;
  st := market.intraday_state(r.source_as_of, r.received_at, '2026-09-14 14:05-04');
  if st->>'state' <> 'DELAYED' or st->>'basis' <> 'source_as_of' then raise exception 'T03 FAIL state % basis %', st->>'state', st->>'basis'; end if;
  st := market.intraday_state(null, '2026-09-14 14:00:07-04', '2026-09-14 14:05-04');
  if st->>'basis' not like 'received_at%' then raise exception 'T03 FAIL basis should disclose receipt time'; end if;
  raise notice 'PASS T03 OI business date is the prior session; provider time vs receipt time is explicit';
end $$;

-- T04 · missing benchmark disables dependent analytics without changing the benchmark definition
do $$
declare pid bigint; res jsonb; o market.outcomes%rowtype;
begin
  -- a synthetic long publication on TESTB from 2026-07-01 with a full price path, and NO SPY bars in that window
  insert into inv.prices (ticker, d, close, volume, source)
    select 'TESTB', s.session_date, 100 + row_number() over (order by s.session_date), 1000, 'test'
      from market.sessions s where s.session_date between '2026-06-25' and '2026-08-15';
  insert into market.decision_history (symbol, as_of, computed_at, published_at, change_kind, is_publication, direction, conviction, surfaced, status, model_version)
    values ('TESTB', '2026-06-30', '2026-07-01 04:30-04', '2026-07-01 04:30-04', 'new', true, 'long', 60, true, 'actionable', 'test')
    returning id into pid;
  delete from inv.prices where ticker = (select symbol from market.benchmarks where role = 'us_equity') and d between '2026-06-25' and '2026-08-15';
  res := market.grade_outcomes(array[5], 'test-grader');
  select * into o from market.outcomes where pub_kind = 'decision' and pub_id = pid and horizon = '5d' and grader_version = 'test-grader';
  if o.state <> 'benchmark_unavailable' or o.success is not null or o.ar is not null then raise exception 'T04 FAIL state=% success=% ar=%', o.state, o.success, o.ar; end if;
  if (select symbol from market.benchmarks where role = 'us_equity') <> 'SPY' then raise exception 'T04 FAIL benchmark definition changed'; end if;
  if o.ret_gross is null or o.ret_gross <= 0 then raise exception 'T04 FAIL raw return should still be computed: %', o.ret_gross; end if;
  raise notice 'PASS T04 missing SPY → benchmark_unavailable, no success verdict, definition unchanged';
end $$;

-- T05 · insufficient SMA history yields unavailable output (nulls), not a short-window number
do $$
declare t market.technicals%rowtype;
begin
  insert into inv.prices (ticker, d, close, volume, source)
    select 'TEST5', s.session_date, 50, 1000, 'test' from market.sessions s where s.session_date between '2026-05-01' and '2026-09-11';  -- ~93 bars
  perform market.refresh_technicals();
  select * into t from market.technicals where symbol = 'TEST5';
  if t.symbol is null then raise exception 'T05 FAIL no technicals row for 93 bars'; end if;
  if t.sma200 is not null or t.dist_sma200 is not null then raise exception 'T05 FAIL sma200 computed from % bars', t.n_obs; end if;
  if t.sma50 is null or t.sma20 is null then raise exception 'T05 FAIL sma50/sma20 should exist with 93 bars'; end if;
  raise notice 'PASS T05 SMA200 unavailable with % bars; SMA50 present', t.n_obs;
end $$;

-- T06 · after-close publications cannot receive same-close fills; intraday ones may use that session's close
do $$
declare pid bigint; o market.outcomes%rowtype; res jsonb;
begin
  insert into inv.prices (ticker, d, close, volume, source)
    select 'TEST6', s.session_date, 100 + (row_number() over (order by s.session_date)) * 0.5, 1000, 'test'
      from market.sessions s where s.session_date between '2026-06-25' and '2026-08-15';
  insert into inv.prices (ticker, d, close, volume, source)
    select 'SPY', s.session_date, 500, 1000, 'test' from market.sessions s where s.session_date between '2026-06-25' and '2026-08-15'
    on conflict (ticker, d) do nothing;
  -- published Wednesday 1 Jul 2026 at 17:00 ET (after the close): execution must be Thursday 2 Jul's close, not Wednesday's
  insert into market.decision_history (symbol, as_of, computed_at, published_at, change_kind, is_publication, direction, conviction, surfaced, status, model_version)
    values ('TEST6', '2026-07-01', '2026-07-01 17:00-04', '2026-07-01 17:00-04', 'new', true, 'long', 60, true, 'actionable', 'test') returning id into pid;
  res := market.grade_outcomes(array[5], 'test-grader');
  select * into o from market.outcomes where pub_kind = 'decision' and pub_id = pid and horizon = '5d' and grader_version = 'test-grader';
  if o.exec_session <> '2026-07-02' then raise exception 'T06 FAIL after-close publication executed on % (expected 2026-07-02)', o.exec_session; end if;
  if o.exec_price <> (select close from inv.prices where ticker = 'TEST6' and d = '2026-07-02') then raise exception 'T06 FAIL exec price'; end if;
  if o.exit_session <> market.session_shift('2026-07-02', 5) then raise exception 'T06 FAIL exit session %', o.exit_session; end if;
  if o.state <> 'graded' or o.success is null then raise exception 'T06 FAIL state %', o.state; end if;
  if o.path_ambiguous is not true then raise exception 'T06 FAIL path ambiguity must be recorded with daily data'; end if;
  -- ret_net = gross - 10 bp, AR signed by direction against SPY (flat → ar = gross)
  if abs(o.ret_net - (o.ret_gross - 0.001)) > 1e-9 then raise exception 'T06 FAIL cost not applied'; end if;
  if abs(o.ar - o.ret_gross) > 1e-9 then raise exception 'T06 FAIL ar % vs gross %', o.ar, o.ret_gross; end if;
  if o.car is null then raise exception 'T06 FAIL car should be computable with a full window'; end if;
  raise notice 'PASS T06 after-close publication filled at the next close; costs, AR and CAR computed';
end $$;

-- T07 · rerunning the grader preserves publication history and creates no duplicate outcome rows
do $$
declare n1 int; n2 int; h1 int; h2 int;
begin
  select count(*) into n1 from market.outcomes where grader_version = 'test-grader';
  select count(*) into h1 from market.decision_history;
  perform market.grade_outcomes(array[5], 'test-grader');
  perform market.grade_outcomes(array[5], 'test-grader');
  select count(*) into n2 from market.outcomes where grader_version = 'test-grader';
  select count(*) into h2 from market.decision_history;
  if n1 <> n2 then raise exception 'T07 FAIL outcomes grew % → %', n1, n2; end if;
  if h1 <> h2 then raise exception 'T07 FAIL history changed'; end if;
  raise notice 'PASS T07 grader is idempotent (% rows before and after)', n1;
end $$;

-- T08 · publication history is append-only
do $$
begin
  begin
    update market.decision_history set conviction = 1 where id = (select min(id) from market.decision_history);
    raise exception 'T08 FAIL update allowed';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    delete from market.decision_history where id = (select min(id) from market.decision_history);
    raise exception 'T08 FAIL delete allowed';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  raise notice 'PASS T08 decision_history refuses update and delete';
end $$;

-- T09 · a re-emitted signal is one publication; a direction flip or a 36 h absence is a new one
do $$
declare n0 int; n1 int; n2 int; n3 int;
begin
  select count(*) into n0 from market.signal_publications;
  insert into market.signals (symbol, as_of, kind, direction, conviction, surfaced, status, dedupe_key, created_at)
    values ('SPY', '2026-09-14 14:00-04', 'put_wall', 1, 70, true, 'active', 'SPY:put_wall', '2026-09-14 14:05-04');
  insert into market.signals (symbol, as_of, kind, direction, conviction, surfaced, status, dedupe_key, created_at)
    values ('SPY', '2026-09-14 17:00-04', 'put_wall', 1, 72, true, 'active', 'SPY:put_wall:2', '2026-09-14 17:05-04');
  select count(*) into n1 from market.signal_publications;
  if n1 - n0 <> 1 then raise exception 'T09 FAIL re-emission created % publications', n1 - n0; end if;
  insert into market.signals (symbol, as_of, kind, direction, conviction, surfaced, status, dedupe_key, created_at)
    values ('SPY', '2026-09-14 20:00-04', 'put_wall', -1, 60, true, 'active', 'SPY:put_wall:3', '2026-09-14 20:05-04');
  select count(*) into n2 from market.signal_publications;
  if n2 - n1 <> 1 then raise exception 'T09 FAIL direction flip did not publish'; end if;
  insert into market.signals (symbol, as_of, kind, direction, conviction, surfaced, status, dedupe_key, created_at)
    values ('SPY', '2026-09-17 14:00-04', 'put_wall', -1, 60, true, 'active', 'SPY:put_wall:4', '2026-09-17 14:05-04');
  select count(*) into n3 from market.signal_publications;
  if n3 - n2 <> 1 then raise exception 'T09 FAIL 36 h absence did not republish'; end if;
  -- an unsurfaced signal never publishes
  insert into market.signals (symbol, as_of, kind, direction, conviction, surfaced, status, dedupe_key, created_at)
    values ('SPY', '2026-09-17 17:00-04', 'call_wall', -1, 20, false, 'muted', 'SPY:call_wall:x', '2026-09-17 17:05-04');
  if (select count(*) from market.signal_publications) <> n3 then raise exception 'T09 FAIL unsurfaced signal published'; end if;
  raise notice 'PASS T09 signal publications: dedupe, direction flip, absence, unsurfaced';
end $$;

-- T10 · a stale price cannot carry an actionable label, and is named stale
do $$
declare dec market.decisions%rowtype; sym text; cutoff date;
begin
  select d.symbol into sym from market.decisions d join market.technicals t on t.symbol = d.symbol where d.surfaced order by d.conviction desc limit 1;
  if sym is null then raise notice 'SKIP T10 no surfaced decision in this database'; return; end if;
  -- age the ticker: delete its newest bars so its last bar is three sessions behind the universe, then recompute
  select market.session_shift(max(p.d), -3) into cutoff from inv.prices p;
  delete from inv.prices p where p.ticker = sym and p.d > cutoff;
  perform market.refresh_technicals();
  perform market.refresh_decisions();
  select * into dec from market.decisions where symbol = sym;
  if dec.surfaced then raise exception 'T10 FAIL % still surfaced with price_state %', sym, dec.price_state; end if;
  if dec.status <> 'stale' or dec.price_state <> 'STALE' then raise exception 'T10 FAIL status % state %', dec.status, dec.price_state; end if;
  raise notice 'PASS T10 % three sessions behind → status stale, not surfaced', sym;
end $$;

-- T11 · a fallback (constructed) stop cannot make a decision "explained" or actionable; every level names its basis
do $$
declare bad int;
begin
  select count(*) into bad from market.decisions where stop_basis = 'fallback_5pct' and (gate_explained or surfaced);
  if bad > 0 then raise exception 'T11 FAIL % decisions surfaced on a fallback stop', bad; end if;
  select count(*) into bad from market.decisions where model_version is not null and status <> 'insufficient' and stop_basis is null;
  if bad > 0 then raise exception 'T11 FAIL % decisions without a stop basis', bad; end if;
  if (market._decision_card((select symbol from market.decisions where model_version is not null and status <> 'insufficient' limit 1))->'levels'->>'target') not like '%scenario%' then
    raise exception 'T11 FAIL target level is not described as a scenario'; end if;
  raise notice 'PASS T11 fallback stops never surface; levels are traceable';
end $$;

-- T12 · unknown dealer inventory is labelled as an assumption on every snapshot
do $$
begin
  if exists (select 1 from market.chain_snapshots where received_at > now() - interval '1 hour' and meta->>'gex_units' not like '%assumed%') then
    raise exception 'T12 FAIL a new snapshot lacks the dealer-inventory assumption label'; end if;
  raise notice 'PASS T12 GEX units and the dealer-inventory assumption are recorded on new snapshots';
end $$;

rollback;
