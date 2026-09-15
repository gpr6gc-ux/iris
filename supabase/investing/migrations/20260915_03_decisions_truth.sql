-- IRIS Investing — Phase 1 · truthful decisions: price state, stop basis, evidence families, append-only history
--
-- What changes for a reader of the Investing tab:
--   * a decision carries price_state (LAST_SESSION / DELAYED / STALE) and sessions_behind; stale names say "stale",
--     never "watch", and cannot be actionable;
--   * stop_basis names where the invalidation level came from (sma20 / sma50 / bb_lower|bb_upper / fallback_5pct);
--     a fallback stop is an invented level, so it can no longer make a decision "explained" or actionable;
--   * evidence_families / families_agree count independent evidence families (trend, momentum, valuation) instead of
--     six correlated factors. The four-gate rule keeps the legacy behaviour until market.params
--     'decisions.multidim_mode' is switched from 'factors' to 'families' (owner decision; see CHECKPOINT.md);
--   * every material change to a decision is appended to market.decision_history (immutable), which is what the
--     grader evaluates. Nothing is graded from the overwritten market.decisions row.
--
-- Rollback (bottom of file).

create table if not exists market.params (
  key text primary key,
  value text not null,
  note text,
  updated_at timestamptz not null default now()
);
insert into market.params (key, value, note) values
  ('decisions.multidim_mode', 'factors', 'factors = legacy: >= 2 of the 6 scored factors agree in sign. families = >= 2 of the independent evidence families (trend, momentum, valuation) agree. Switch with: update market.params set value = ''families'', updated_at = now() where key = ''decisions.multidim_mode''; then select market.refresh_decisions();'),
  ('decisions.model_version', 'decisions-2026.09.15', 'Stamped on every decision and history row. Bump when scoring, gating or level construction changes.'),
  ('grader.cost_bp_round_trip', '10', 'Round-trip cost in basis points deducted from every graded return (spread + slippage assumption for liquid US equities). Not a measurement.')
on conflict (key) do nothing;

create or replace function market.param(p_key text, p_default text default null) returns text
language sql stable as $$ select coalesce((select value from market.params where key = p_key), p_default) $$;

alter table market.decisions
  add column if not exists price_state       text,
  add column if not exists sessions_behind   integer,
  add column if not exists stop_basis        text,
  add column if not exists evidence_families integer,
  add column if not exists families_agree    integer,
  add column if not exists model_version     text;

comment on column market.decisions.price_state is 'LAST_SESSION | DELAYED (1 session behind) | STALE (2+), relative to the exchange session calendar at compute time.';
comment on column market.decisions.stop_basis is 'Which observed level the invalidation (stop_ref) is: sma20 | sma50 | bb_lower | bb_upper | fallback_5pct (constructed, disqualifies "explained").';
comment on column market.decisions.evidence_families is 'How many independent evidence families had data: trend (SMA structure), momentum (1m/3m return, RSI, %B), valuation (EDGAR fundamentals).';
comment on column market.decisions.families_agree is 'How many of those families agree with the decision direction.';
comment on column market.decisions.target_ref is 'Scenario reference level = entry + 2 x (entry - stop). A constructed level, not a forecast.';
comment on column market.decisions.risk_pct is 'Stop distance as a fraction of entry: (entry - stop) / entry. Not portfolio risk, not a maximum loss.';

-- ---- append-only history -------------------------------------------------------------------------------------
create table if not exists market.decision_history (
  id                bigint generated always as identity primary key,
  symbol            text not null,
  as_of             date not null,
  computed_at       timestamptz not null,
  published_at      timestamptz not null default now(),
  change_kind       text not null,                     -- new | direction | surfaced | unsurfaced | update
  is_publication    boolean not null default false,    -- first time this direction is surfaced (what the grader evaluates)
  prev_id           bigint references market.decision_history(id),
  direction         text, posture text, conviction integer, dir_score numeric,
  entry_ref         numeric, stop_ref numeric, target_ref numeric, stop_basis text, risk_pct numeric,
  surfaced          boolean, status text, price_state text, sessions_behind integer,
  gate_fresh        boolean, gate_multidim boolean, gate_verified boolean, gate_explained boolean,
  evidence_families integer, families_agree integer, regime_state text,
  why               jsonb, factors jsonb,
  model_version     text, params_version text
);
create index if not exists decision_history_symbol_idx on market.decision_history (symbol, published_at desc);
create index if not exists decision_history_pub_idx on market.decision_history (published_at desc) where is_publication;
comment on table market.decision_history is 'Append-only record of every material change to market.decisions. Rows are never updated or deleted (trigger-enforced). is_publication marks the first surfacing of a direction: the unit the grader evaluates.';

create or replace function market.decision_history_guard() returns trigger
language plpgsql as $$ begin raise exception 'market.decision_history is append-only'; end $$;
drop trigger if exists decision_history_immutable on market.decision_history;
create trigger decision_history_immutable before update or delete on market.decision_history
  for each row execute function market.decision_history_guard();

create or replace function market.decision_history_capture() returns trigger
language plpgsql as $$
declare p market.decision_history%rowtype; kind text; pub boolean;
begin
  select * into p from market.decision_history h where h.symbol = new.symbol order by h.published_at desc, h.id desc limit 1;
  if p.id is null then kind := 'new';
  elsif p.direction is distinct from new.direction then kind := 'direction';
  elsif (not coalesce(p.surfaced, false)) and coalesce(new.surfaced, false) then kind := 'surfaced';
  elsif coalesce(p.surfaced, false) and not coalesce(new.surfaced, false) then kind := 'unsurfaced';
  elsif p.as_of is distinct from new.as_of or p.status is distinct from new.status
        or abs(coalesce(p.conviction, 0) - coalesce(new.conviction, 0)) >= 5
        or p.stop_basis is distinct from new.stop_basis or p.price_state is distinct from new.price_state then kind := 'update';
  else return new;                                     -- nothing material changed: no row
  end if;
  pub := coalesce(new.surfaced, false) and (p.id is null or not coalesce(p.surfaced, false) or p.direction is distinct from new.direction);
  insert into market.decision_history (symbol, as_of, computed_at, change_kind, is_publication, prev_id,
    direction, posture, conviction, dir_score, entry_ref, stop_ref, target_ref, stop_basis, risk_pct,
    surfaced, status, price_state, sessions_behind, gate_fresh, gate_multidim, gate_verified, gate_explained,
    evidence_families, families_agree, regime_state, why, factors, model_version, params_version)
  values (new.symbol, new.as_of, new.computed_at, kind, pub, p.id,
    new.direction, new.posture, new.conviction, new.dir_score, new.entry_ref, new.stop_ref, new.target_ref, new.stop_basis, new.risk_pct,
    new.surfaced, new.status, new.price_state, new.sessions_behind, new.gate_fresh, new.gate_multidim, new.gate_verified, new.gate_explained,
    new.evidence_families, new.families_agree, new.regime_state, new.why, new.factors, new.model_version,
    market.param('decisions.multidim_mode', 'factors'));
  return new;
end $$;
drop trigger if exists decision_history_capture on market.decisions;
create trigger decision_history_capture after insert or update on market.decisions
  for each row execute function market.decision_history_capture();

-- ---- the decision engine, v2 ----------------------------------------------------------------------------------
create or replace function market.refresh_decisions()
 returns integer
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'pg_temp'
 set statement_timeout to '90s'
as $function$
declare n int; v_now timestamptz := now(); v_mode text := market.param('decisions.multidim_mode', 'factors');
        v_model text := market.param('decisions.model_version', 'decisions-2026.09.15');
begin
  with reg as (select * from market.regime order by as_of desc limit 1),
  base as (
    select t.*, f.name, f.cik, f.revenue_ttm, f.net_income_ttm, f.equity, f.shares, f.debt, f.liabilities, f.assets
    from market.technicals t
    left join lateral (
      select se.name, se.cik, fu.revenue_ttm, fu.net_income_ttm, fu.equity, fu.shares, fu.debt, fu.liabilities, fu.assets
      from inv.securities se
      left join inv.fundamentals fu on fu.cik = se.cik
      where se.ticker = t.symbol
      order by se.is_active desc nulls last, fu.computed_at desc nulls last
      limit 1
    ) f on true
  ),
  fund as (
    select b.*,
      case when shares>0 and revenue_ttm>0 then close*shares/revenue_ttm end as ps,
      case when shares>0 and net_income_ttm>0 then close*shares/net_income_ttm end as pe,
      case when shares>0 and equity>0 then close*shares/equity end as pb,
      case when equity>0 then coalesce(debt, liabilities)/equity end as lev,
      coalesce(net_income_ttm>0,false) as profitable,
      (revenue_ttm is not null) as has_fund
    from base b
  ),
  sig as (
    select fund.*,
      greatest(-1, least(1, coalesce(trend_stack,0)*0.8 + case cross_state when 'golden' then 0.2 when 'death' then -0.2 else 0 end)) as s_trend,
      greatest(-1, least(1, coalesce(dist_sma200,0)/0.10)) as s_ma,
      greatest(-1, least(1, (coalesce(ret_1m,0)*0.6 + coalesce(ret_3m,0)*0.4)/0.10)) as s_mom,
      case
        when rsi14 is null then 0
        when rsi14 >= 50 and rsi14 <= 70 then (rsi14-50)/20.0
        when rsi14 > 70 then greatest(-0.6, 1 - (rsi14-70)/30.0*1.5)
        when rsi14 < 50 and rsi14 >= 30 then (rsi14-50)/20.0
        else greatest(-1.0, -1 + (30-rsi14)/30.0*1.3)
      end as s_rsi,
      case
        when bb_pctb is null then 0
        when bb_pctb between 0.5 and 1.0 then (bb_pctb-0.5)/0.5*0.8
        when bb_pctb > 1.0 then greatest(-0.6, 0.8 - (bb_pctb-1.0)/0.3*1.2)
        when bb_pctb >= 0 and bb_pctb < 0.5 then (bb_pctb-0.5)/0.5*0.8
        else least(0.6, -0.8 + (0-bb_pctb)/0.3*1.2)
      end as s_bb,
      case when not (revenue_ttm is not null) then 0 else
        greatest(-1, least(1,
          0.4*greatest(-1,least(1,(2.5 - coalesce(ps,2.5))/2.5))
        + 0.4*(case when pe is null then -0.3 else greatest(-1,least(1,(25 - pe)/25.0)) end)
        + (case when profitable then 0.2 else -0.4 end)
        + (case when lev is null then 0 when lev<1 then 0.2 when lev>2.5 then -0.5 else -0.1*(lev-1) end)
        )) end as s_val
    from fund
  ),
  adj as (
    select sig.*,
      (24*s_trend + 10*s_ma + 20*s_mom + 16*s_rsi + 14*s_bb + 16*s_val) as dir_raw,
      rr.reg_state_x as reg_state, coalesce((select shaky from reg),false) as reg_shaky, rr.reg_up_x as reg_up,
      (bb_pctb>1.05 or rsi14>78) as extended_long,
      case when rr.reg_state_x='shaky' and (24*s_trend+10*s_ma+20*s_mom+16*s_rsi+14*s_bb+16*s_val)>0 then 0.65
           when rr.reg_state_x='elevated' and (24*s_trend+10*s_ma+20*s_mom+16*s_rsi+14*s_bb+16*s_val)>0 then 0.82
           when rr.reg_state_x='calm' and (24*s_trend+10*s_ma+20*s_mom+16*s_rsi+14*s_bb+16*s_val)>0 and rr.reg_up_x then 1.08
           else 1.0 end as mult,
      case when rr.reg_state_x in ('shaky','elevated') then 20 else 12 end as dz
    from sig
    cross join (select (select state from reg) as reg_state_x, coalesce((select mkt_above_sma50 from reg),false) as reg_up_x) rr
  ),
  d2 as (select adj.*, greatest(-100, least(100, dir_raw*mult)) as dir_adj from adj),
  d3 as (
    select d2.*,
      case when dir_adj >= dz then 'long' when dir_adj <= -dz then 'short' else 'neutral' end as direction,
      round(abs(dir_adj))::int as conviction
    from d2
  ),
  d3b as (
    select d3.*,
      close as entry_ref,
      case when direction='long'  then coalesce(greatest(case when sma20<close then sma20 end, case when sma50<close then sma50 end, case when bb_lower<close then bb_lower end), close*0.95)
           when direction='short' then coalesce(least(case when sma20>close then sma20 end, case when sma50>close then sma50 end, case when bb_upper>close then bb_upper end), close*1.05)
           else bb_lower end as stop_ref
    from d3
  ),
  d3c as (
    select d3b.*,
      case when direction='long'  then close + 2*(close-stop_ref)
           when direction='short' then close - 2*(stop_ref-close)
           else bb_upper end as target_ref,
      case when direction='long'  and close>0 then (close-stop_ref)/close
           when direction='short' and close>0 then (stop_ref-close)/close
           else null end as risk_pct,
      case when direction='neutral' then 'bb_lower'
           when direction='long'  and stop_ref = sma20 then 'sma20'
           when direction='long'  and stop_ref = sma50 then 'sma50'
           when direction='long'  and stop_ref = bb_lower then 'bb_lower'
           when direction='short' and stop_ref = sma20 then 'sma20'
           when direction='short' and stop_ref = sma50 then 'sma50'
           when direction='short' and stop_ref = bb_upper then 'bb_upper'
           else 'fallback_5pct' end as stop_basis,
      market.sessions_behind(as_of, v_now) as behind
    from d3b
  ),
  d4 as (
    select d3c.*,
      (behind <= 1) as g_fresh,
      case when behind = 0 then 'LAST_SESSION' when behind = 1 then 'DELAYED' else 'STALE' end as price_state,
      (n_obs>=60 and close>0 and sma50 is not null) as g_verified,
      -- legacy count: how many of the six scored factors agree in sign with the total
      ( (case when sign(dir_adj)=sign(s_trend) and abs(s_trend)>0.2 then 1 else 0 end)
       +(case when sign(dir_adj)=sign(s_ma)    and abs(s_ma)>0.2    then 1 else 0 end)
       +(case when sign(dir_adj)=sign(s_mom)   and abs(s_mom)>0.2   then 1 else 0 end)
       +(case when sign(dir_adj)=sign(s_rsi)   and abs(s_rsi)>0.2   then 1 else 0 end)
       +(case when sign(dir_adj)=sign(s_bb)    and abs(s_bb)>0.2    then 1 else 0 end)
       +(case when sign(dir_adj)=sign(s_val)   and abs(s_val)>0.2   then 1 else 0 end)) as factors_agree,
      -- independent families: trend structure (SMA stack, distance to 200-day), momentum (1m/3m, RSI, %B), valuation
      (case when sma50 is not null then 1 else 0 end) + 1 + (case when has_fund then 1 else 0 end) as evidence_families,
      ( (case when sma50 is not null and ((sign(dir_adj)=sign(s_trend) and abs(s_trend)>0.2) or (sign(dir_adj)=sign(s_ma) and abs(s_ma)>0.2)) then 1 else 0 end)
       +(case when (sign(dir_adj)=sign(s_mom) and abs(s_mom)>0.2) or (sign(dir_adj)=sign(s_rsi) and abs(s_rsi)>0.2) or (sign(dir_adj)=sign(s_bb) and abs(s_bb)>0.2) then 1 else 0 end)
       +(case when has_fund and sign(dir_adj)=sign(s_val) and abs(s_val)>0.2 then 1 else 0 end)) as families_agree
    from d3c
  ),
  d4b as (
    select d4.*,
      (direction<>'neutral' and case when v_mode = 'families' then families_agree >= 2 else factors_agree >= 2 end) as g_multidim,
      (stop_ref is not null and stop_basis <> 'fallback_5pct') as g_explained
    from d4
  ),
  d5 as (
    select d4b.*,
      jsonb_build_array(
        jsonb_build_object('k','trend','family','trend','label','Trend structure','s',round(s_trend,3),'points',round(24*s_trend,1),
          'text', case when trend_stack=1 then 'Above the 50 & 200-day'||case when cross_state='golden' then ', golden cross' else '' end
                       when trend_stack=-1 then 'Below the 50 & 200-day'||case when cross_state='death' then ', death cross' else '' end
                       else 'Trend mixed (price between the 50 & 200-day)' end),
        jsonb_build_object('k','ma','family','trend','label','Distance to 200-day','s',round(s_ma,3),'points',round(10*s_ma,1),
          'text', case when dist_sma200 is null then '200-day not established'
                       else round(100*dist_sma200)||'% '||case when dist_sma200>=0 then 'above' else 'below' end||' the 200-day' end),
        jsonb_build_object('k','mom','family','momentum','label','Momentum (1m/3m)','s',round(s_mom,3),'points',round(20*s_mom,1),
          'text', 'Return '||round(100*coalesce(ret_1m,0))||'% 1m · '||round(100*coalesce(ret_3m,0))||'% 3m'),
        jsonb_build_object('k','rsi','family','momentum','label','RSI(14)','s',round(s_rsi,3),'points',round(16*s_rsi,1),
          'text', 'RSI '||round(coalesce(rsi14,0))||case when rsi14>78 then ' (overbought)' when rsi14<25 then ' (oversold)' else '' end),
        jsonb_build_object('k','bb','family','momentum','label','Bollinger %B','s',round(s_bb,3),'points',round(14*s_bb,1),
          'text', case when bb_pctb is null then 'bands not established'
                       when bb_pctb>1 then 'Above the upper band (%B '||round(bb_pctb,2)||')'
                       when bb_pctb<0 then 'Below the lower band (%B '||round(bb_pctb,2)||')'
                       else '%B '||round(bb_pctb,2)||' within the bands' end),
        jsonb_build_object('k','val','family','valuation','label','Valuation overlay','s',round(s_val,3),'points',round(16*s_val,1),
          'text', case when not has_fund then 'no EDGAR fundamentals'
                       else 'P/S '||coalesce(round(ps,1)::text,'—')||' · P/E '||coalesce(round(pe,1)::text,'—')||' · '||case when profitable then 'profitable' else 'unprofitable' end end)
      ) as factors
    from d4b
  )
  insert into market.decisions as t (symbol,as_of,name,close,direction,posture,conviction,conviction_band,dir_score,dir_raw,options_posture,headline,entry_ref,stop_ref,target_ref,rr,risk_pct,regime_state,gate_fresh,gate_multidim,gate_verified,gate_explained,surfaced,status,has_fundamentals,why,factors,computed_at,
    price_state,sessions_behind,stop_basis,evidence_families,families_agree,model_version)
  select
    symbol, as_of, coalesce(name,symbol), close, direction,
    case when dir_adj>=45 then 'LONG' when dir_adj>=dz then 'LEAN LONG'
         when dir_adj<=-45 then 'SHORT' when dir_adj<=-dz then 'LEAN SHORT' else 'NEUTRAL' end,
    conviction,
    case when conviction>=70 then 'High' when conviction>=40 then 'Medium' else 'Low' end,
    round(dir_adj,1), round(dir_raw,1),
    -- expression IDEAS by direction/regime only. No contract, quote, IV, expiry or liquidity was consulted; the UI
    -- must show these as unchecked ideas, never as a proposed trade.
    case
      when direction='long'  and reg_shaky then 'Defined-risk only — call debit spreads, small size'
      when direction='long'  and extended_long then 'Extended — don''t chase; buy a pullback to the 20-day, or sell puts / call spreads'
      when direction='long'  and conviction>=70 then 'Calls or call debit spreads'
      when direction='long'  then 'Call debit spread or a starter long'
      when direction='short' and reg_shaky then 'Put debit spreads (defined risk)'
      when direction='short' and conviction>=70 then 'Puts or put debit spreads'
      when direction='short' then 'Put debit spread, or trim / avoid'
      else 'No clear edge — stand aside' end,
    case
      when direction='long'  and extended_long then 'Uptrend and momentum strong but stretched above the upper band — long the trend, add on a pullback toward the 20-day near $'||round(sma20,2)||'; invalidation below $'||round(stop_ref,2)||'.'
      when direction='long'  and trend_stack=1 then 'Above the 50 & 200-day with positive momentum — constructive long; invalidation below $'||round(stop_ref,2)||'.'
      when direction='long'  then 'Turning up — improving momentum; long with a stop below $'||round(stop_ref,2)||'.'
      when direction='short' and trend_stack=-1 then 'Below the 50 & 200-day'||case when cross_state='death' then ' with a death cross' else '' end||' and weak momentum — short / avoid; invalidation above $'||round(stop_ref,2)||'.'
      when direction='short' then 'Rolling over — momentum weakening; short / avoid, invalidation above $'||round(stop_ref,2)||'.'
      else 'Mixed signals, no clear edge — roughly $'||round(bb_lower,2)||'–$'||round(bb_upper,2)||' range; stand aside.' end,
    round(entry_ref,2), round(stop_ref,2), round(target_ref,2),
    2.0, round(risk_pct,4),
    reg_state,
    g_fresh, g_multidim, g_verified, g_explained,
    (g_fresh and g_verified and g_explained and g_multidim and conviction>=35 and direction<>'neutral'),
    case when behind >= 2 then 'stale'
         when not g_verified then 'insufficient'
         when (g_fresh and g_verified and g_explained and g_multidim and conviction>=35 and direction<>'neutral') then 'actionable'
         else 'watch' end,
    has_fund,
    (select jsonb_agg(e) from (select e from jsonb_array_elements(factors) e order by abs((e->>'points')::numeric) desc limit 3) z),
    factors, v_now,
    price_state, behind, stop_basis, evidence_families, families_agree, v_model
  from d5
  on conflict (symbol) do update set
    as_of=excluded.as_of, name=excluded.name, close=excluded.close, direction=excluded.direction, posture=excluded.posture,
    conviction=excluded.conviction, conviction_band=excluded.conviction_band, dir_score=excluded.dir_score, dir_raw=excluded.dir_raw,
    options_posture=excluded.options_posture, headline=excluded.headline,
    entry_ref=excluded.entry_ref, stop_ref=excluded.stop_ref, target_ref=excluded.target_ref, rr=excluded.rr, risk_pct=excluded.risk_pct,
    regime_state=excluded.regime_state, gate_fresh=excluded.gate_fresh, gate_multidim=excluded.gate_multidim,
    gate_verified=excluded.gate_verified, gate_explained=excluded.gate_explained, surfaced=excluded.surfaced, status=excluded.status,
    has_fundamentals=excluded.has_fundamentals, why=excluded.why, factors=excluded.factors, computed_at=excluded.computed_at,
    price_state=excluded.price_state, sessions_behind=excluded.sessions_behind, stop_basis=excluded.stop_basis,
    evidence_families=excluded.evidence_families, families_agree=excluded.families_agree, model_version=excluded.model_version;
  get diagnostics n = row_count;
  -- a decision whose technicals vanished (ticker fell below 60 bars, was delisted, or lost its history) cannot keep
  -- an actionable label from an earlier run
  update market.decisions d
     set surfaced = false, status = 'insufficient', price_state = 'UNAVAILABLE', gate_fresh = false, computed_at = v_now, model_version = v_model
   where not exists (select 1 from market.technicals t where t.symbol = d.symbol)
     and (d.surfaced or d.status is distinct from 'insufficient' or d.price_state is distinct from 'UNAVAILABLE');
  return n;
end $function$;

-- ---- the card, v2: every level says where it came from -------------------------------------------------------
create or replace function market._decision_card(p_symbol text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'symbol', d.symbol, 'name', d.name, 'posture', d.posture, 'direction', d.direction,
    'conviction', d.conviction, 'band', d.conviction_band, 'status', d.status, 'surfaced', d.surfaced,
    'close', d.close, 'chg_1d', te.chg_1d, 'ret_1m', te.ret_1m, 'ret_3m', te.ret_3m,
    'rsi', round(te.rsi14), 'pctb', round(te.bb_pctb,2), 'pos_52w', round(te.pos_52w,3),
    'options', d.options_posture, 'options_checked', false,
    'headline', d.headline,
    'entry', d.entry_ref, 'stop', d.stop_ref, 'target', d.target_ref, 'risk_pct', d.risk_pct, 'rr', d.rr,
    'stop_basis', d.stop_basis, 'stop_distance_pct', d.risk_pct, 'target_kind', 'scenario_2r',
    'levels', jsonb_build_object(
        'entry',  'last close of the session dated as_of',
        'stop',   case d.stop_basis when 'sma20' then '20-day SMA' when 'sma50' then '50-day SMA'
                                    when 'bb_lower' then 'lower Bollinger band (20, 2σ)' when 'bb_upper' then 'upper Bollinger band (20, 2σ)'
                                    when 'fallback_5pct' then 'no observed level on the right side — 5% from entry (constructed; not explained)'
                                    else coalesce(d.stop_basis, '—') end,
        'target', 'entry + 2 × (entry − stop): a scenario reference level, not a forecast'),
    'price_state', d.price_state, 'sessions_behind', d.sessions_behind,
    'evidence_families', d.evidence_families, 'families_agree', d.families_agree,
    'model_version', d.model_version,
    'why', d.why, 'as_of', d.as_of, 'has_fundamentals', d.has_fundamentals, 'regime', d.regime_state)
  from market.decisions d left join market.technicals te on te.symbol = d.symbol
  where d.symbol = p_symbol;
$function$;

-- ---- what the Investing tab asks for, v2 -----------------------------------------------------------------------
create or replace function public.iris2_investing()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'pg_temp'
 set statement_timeout to '8s'
as $function$
declare t0 timestamptz := clock_timestamp();
declare v_asof date; v_prices_session date; v_prev_session date; v_cov numeric; v_universe int;
        v_chain_src timestamptz; v_chain_rcv timestamptz;
begin
  perform brain.require_scope('investing');
  select max(as_of) into v_asof from market.decisions;
  -- the prices "session" is the newest session on which the feed delivered the universe (>= 1,000 bars), not the
  -- newest bar of any single ticker
  select max(d) into v_prices_session from (select d from inv.prices group by d having count(*) >= 1000) q;
  select max(d) into v_prev_session from (select d from inv.prices where d < v_prices_session group by d having count(*) >= 1000) q;
  select count(distinct ticker) into v_universe from inv.prices where d = v_prices_session;
  v_cov := case when v_prev_session is null then null else
    round((select count(*) from inv.prices where d = v_prices_session)::numeric / nullif((select count(*) from inv.prices where d = v_prev_session), 0), 3) end;
  select max(source_as_of), max(received_at) into v_chain_src, v_chain_rcv from market.chain_snapshots;

  return iris2._ok(jsonb_build_object(
    'as_of', v_asof,
    'model_version', market.param('decisions.model_version'),
    'multidim_mode', market.param('decisions.multidim_mode', 'factors'),
    'regime', (select to_jsonb(r) from (
        select state, stability, shaky, breadth_above50, breadth_above200, breadth_rsi_bull, net_1m,
               mkt_ret_1m, mkt_rvol, mkt_rvol_pctile, mkt_above_sma50, curve_2s10s, gex_regime,
               factors->>'explain' as explain, factors->'contrib' as contrib, as_of
        from market.regime order by as_of desc limit 1) r),
    'counts', jsonb_build_object(
        'actionable', (select count(*) from market.decisions where surfaced),
        'longs',  (select count(*) from market.decisions where surfaced and direction='long'),
        'shorts', (select count(*) from market.decisions where surfaced and direction='short'),
        'universe', (select count(*) from market.decisions),
        'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from market.decisions group by status) s),
        'by_price_state', (select coalesce(jsonb_object_agg(coalesce(price_state,'UNKNOWN'), n), '{}'::jsonb) from (select price_state, count(*) n from market.decisions group by price_state) s),
        'priced_tickers', v_universe),
    'watchlist', (select coalesce(jsonb_agg(card order by pr), '[]'::jsonb) from (
        select u.priority as pr,
          case when d.symbol is null then
            jsonb_build_object('symbol', u.symbol, 'name', u.name,
              'status', case when nb.n = 0 then 'no_price_data' else 'insufficient_history' end,
              'bars', nb.n, 'bars_needed', 60, 'last_bar', nb.mx,
              'note', case when nb.n = 0 then 'no price history' else nb.n || ' daily bars on file, 60 needed — history backfill pending' end)
          else market._decision_card(d.symbol) end as card
        from market.underlyings u
        left join market.decisions d on d.symbol = u.symbol
        left join lateral (select count(*) n, max(p.d) mx from inv.prices p where p.ticker = u.symbol) nb on true
        where u.active) w),
    'longs', (select coalesce(jsonb_agg(market._decision_card(symbol) order by conviction desc), '[]'::jsonb) from (
        select d.symbol, d.conviction from market.decisions d join market.technicals te on te.symbol=d.symbol
        where d.surfaced and d.direction='long' and d.close>=5 and coalesce(te.close*te.vol_avg20,0) >= 20000000
        order by d.conviction desc limit 12) a),
    'shorts', (select coalesce(jsonb_agg(market._decision_card(symbol) order by conviction desc), '[]'::jsonb) from (
        select d.symbol, d.conviction from market.decisions d join market.technicals te on te.symbol=d.symbol
        where d.surfaced and d.direction='short' and d.close>=5 and coalesce(te.close*te.vol_avg20,0) >= 20000000
        order by d.conviction desc limit 12) b),
    'feeds', jsonb_build_object(
        'prices', market.daily_state(v_prices_session, now()) || jsonb_build_object(
            'dataset', 'inv.prices', 'source', 'massive:grouped-daily', 'cadence', 'one session per run, after the provider''s end of day',
            'tickers', v_universe, 'coverage_vs_prior', v_cov,
            'basis', 'newest session with >= 1,000 bars; a single ticker with a newer bar does not count'),
        'decisions', jsonb_build_object(
            'computed_at', (select max(computed_at) from market.decisions),
            'as_of', v_asof, 'model_version', market.param('decisions.model_version'),
            'basis', 'recomputed from inv.prices after each price load'),
        'chains', market.intraday_state(v_chain_src, v_chain_rcv, now(), 900, 1200) || jsonb_build_object(
            'dataset', 'market.chain_snapshots', 'source', 'cboe:delayed_quotes (15-minute delayed)', 'cadence', '14:00, 17:00, 20:00 ET on session days',
            'oi_business_date', (select max(oi_business_date) from market.chain_snapshots),
            'symbols', (select count(distinct symbol) from market.chain_snapshots where as_of > now() - interval '3 days')),
        'macro', market.daily_state((select max(d) from inv.macro), now()) || jsonb_build_object('dataset', 'inv.macro', 'source', 'FRED', 'cadence', 'daily 11:15 UTC; series publish with their own lags'),
        'fundamentals', jsonb_build_object('as_of', (select max(computed_at)::date from inv.fundamentals), 'dataset', 'inv.fundamentals', 'source', 'SEC EDGAR XBRL', 'cadence', 'nightly; only fills missing coverage', 'state', 'REFERENCE')),
    -- kept for older clients
    'freshness', jsonb_build_object(
        'prices_as_of', v_prices_session,
        'prices_stale', (market.daily_state(v_prices_session, now())->>'state') = 'STALE',
        'fundamentals_as_of', (select max(computed_at)::date from inv.fundamentals),
        'macro_as_of', (select max(d) from inv.macro),
        'computed_at', (select max(computed_at) from market.decisions)),
    'scope_note', 'Decisions cover the ' || (select count(*) from market.decisions) || ' names with at least 60 daily bars; the price feed itself covers ' || coalesce(v_universe::text, '—') || ' tickers and the history backfill is in progress (benchmark ETFs included). Levels are observed moving averages and bands; the 2R level is a scenario reference, not a forecast. Decision-support, not advice.'
  ), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$;

-- Rollback:
--   restore market.refresh_decisions, market._decision_card and public.iris2_investing from functions_investing.sql;
--   drop trigger decision_history_capture on market.decisions; drop function market.decision_history_capture();
--   drop trigger decision_history_immutable on market.decision_history; drop function market.decision_history_guard();
--   drop table market.decision_history;
--   alter table market.decisions drop column price_state, drop column sessions_behind, drop column stop_basis,
--     drop column evidence_families, drop column families_agree, drop column model_version;
--   drop function market.param(text,text); drop table market.params;
