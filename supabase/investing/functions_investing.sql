-- IRIS investing functions (generated 2026-09-14)
-- The compute chain (market.refresh_*), the worker lane (iris_inv_*, iris_positioning_*, iris_price*) and the owner lane (iris2_*).
-- Gates (brain.check_app_token / brain.require_scope) are referenced, not included: they live outside this repo.

-- ---- inv.screen_value
CREATE OR REPLACE FUNCTION inv.screen_value(p_max_ps numeric DEFAULT 3.0, p_max_pb numeric DEFAULT 1.0, p_max_pe numeric DEFAULT NULL::numeric, p_limit integer DEFAULT 200)
 RETURNS TABLE(ticker text, name text, cik integer, exchange text, sic_desc text, price numeric, price_date date, market_cap numeric, ps numeric, pb numeric, pe numeric, revenue_ttm numeric, equity numeric, net_income_ttm numeric, shares numeric, revenue_asof date, equity_end date, net_income_asof date, revenue_basis text, leverage numeric, cash_to_cap numeric, score numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with px as (
    select p.ticker, p.close, p.d,
           row_number() over (partition by p.ticker order by p.d desc) rn
    from inv.prices p
  ),
  base as (
    select s.ticker, s.name, s.cik, s.exchange, s.sic_desc,
           x.close as price, x.d as price_date,
           f.revenue_ttm, f.equity, f.net_income_ttm, f.shares,
           f.revenue_asof, f.equity_end, f.net_income_asof, f.revenue_basis,
           f.assets, f.liabilities, f.cash,
           x.close * f.shares as market_cap
    from inv.securities s
    join inv.fundamentals f on f.cik = s.cik
    join px x on x.ticker = s.ticker and x.rn = 1
    where s.is_active
      and s.kind = 'common'
      and s.excluded_reason is null
      and f.currency = 'USD'
      and coalesce(f.shares,0)      > 100000   -- kills millions-scale tagging errors
      and coalesce(f.equity,0)      > 0        -- a negative-book company is not "cheap"
      and coalesce(f.revenue_ttm,0) > 0
      -- net income cannot exceed revenue; when it does the filing is mis-tagged and
      -- every revenue-based multiple built on it is unreliable.
      and (f.net_income_ttm is null or f.net_income_ttm <= f.revenue_ttm)
      -- realistic/aggressive quality floor (owner-approved 2026-08-30):
      and f.revenue_ttm >= 50000000                                   -- real operating business, not a micro/shell
      and coalesce(f.net_income_ttm,0) > 0                            -- profitable; a cheap unprofitable name is a value trap
      and (f.assets is null or coalesce(f.liabilities,0) / nullif(f.assets,0) < 0.85)  -- not over-levered
      and f.revenue_asof > current_date - 400
      and f.equity_end   > current_date - 200
  ),
  m as (
    select b.*,
           round(market_cap / nullif(revenue_ttm,0), 4) as ps,
           round(market_cap / nullif(equity,0), 4)      as pb,
           -- P/E only where earnings are positive; a negative P/E is not a cheapness signal
           case when coalesce(net_income_ttm,0) > 0
                then round(market_cap / net_income_ttm, 4) end as pe,
           round(coalesce(liabilities,0) / nullif(assets,0), 4) as leverage,
           round(coalesce(cash,0) / nullif(market_cap,0), 4)    as cash_to_cap
    from base b
  )
  select ticker, name, cik, exchange, sic_desc, price, price_date,
         round(market_cap,0), ps, pb, pe,
         revenue_ttm, equity, net_income_ttm, shares,
         revenue_asof, equity_end, net_income_asof, revenue_basis,
         leverage, cash_to_cap,
         -- deterministic 0-100. No model opinion anywhere in it.
         round(least(100, greatest(0,
             40 * greatest(0, (p_max_ps - ps) / nullif(p_max_ps,0))
           + 40 * greatest(0, (p_max_pb - pb) / nullif(p_max_pb,0))
           - 20 * greatest(0, coalesce(leverage,0.5) - 0.6) / 0.4
           + 20 * least(1, coalesce(cash_to_cap,0))
         )), 2) as score
  from m
  where ps < p_max_ps
    and pb < p_max_pb
    and (p_max_pe is null or (pe is not null and pe < p_max_pe))
  order by score desc, pb asc
  limit greatest(1, p_limit);
$function$
;

-- ---- market._decision_card
CREATE OR REPLACE FUNCTION market._decision_card(p_symbol text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'symbol', d.symbol, 'name', d.name, 'posture', d.posture, 'direction', d.direction,
    'conviction', d.conviction, 'band', d.conviction_band, 'status', d.status, 'surfaced', d.surfaced,
    'close', d.close, 'chg_1d', te.chg_1d, 'ret_1m', te.ret_1m, 'ret_3m', te.ret_3m,
    'rsi', round(te.rsi14), 'pctb', round(te.bb_pctb,2), 'pos_52w', round(te.pos_52w,3),
    'options', d.options_posture, 'headline', d.headline,
    'entry', d.entry_ref, 'stop', d.stop_ref, 'target', d.target_ref, 'risk_pct', d.risk_pct, 'rr', d.rr,
    'why', d.why, 'as_of', d.as_of, 'has_fundamentals', d.has_fundamentals, 'regime', d.regime_state)
  from market.decisions d left join market.technicals te on te.symbol = d.symbol
  where d.symbol = p_symbol;
$function$
;

-- ---- market._gexfmt
CREATE OR REPLACE FUNCTION market._gexfmt(p numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select case
    when p is null then '—'
    when abs(p) >= 1e9 then (case when p<0 then '-' else '+' end)||'$'||to_char(abs(p)/1e9,'FM999990.0')||'B'
    when abs(p) >= 1e6 then (case when p<0 then '-' else '+' end)||'$'||to_char(abs(p)/1e6,'FM999990')||'M'
    else (case when p<0 then '-' else '+' end)||'$'||to_char(abs(p),'FM999999999') end;
$function$
;

-- ---- market._ingest_chain
CREATE OR REPLACE FUNCTION market._ingest_chain(p_symbol text, p_as_of timestamp with time zone, p_spot numeric, p_cells jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
declare
  v_snap uuid; v_net numeric; v_zg numeric; v_cw numeric; v_pw numeric; v_gross numeric;
  v_regime text; v_coi bigint; v_poi bigint; v_contracts int; v_expiries int; v_written int; t0 timestamptz := clock_timestamp();
begin
  if p_spot is null or p_spot <= 0 then raise exception 'invalid spot for %', p_symbol; end if;
  if not exists (select 1 from market.underlyings where symbol = p_symbol) then
    raise exception 'unknown underlying %', p_symbol; end if;

  with cells as (
    select (c->>'e')::date expiry, (c->>'k')::numeric strike,
           coalesce((c->>'coi')::numeric,0) coi, coalesce((c->>'poi')::numeric,0) poi,
           round((coalesce((c->>'cg')::numeric,0)*coalesce((c->>'coi')::numeric,0)
                - coalesce((c->>'pg')::numeric,0)*coalesce((c->>'poi')::numeric,0)) * 100 * p_spot*p_spot * 0.01, 2) dg
      from jsonb_array_elements(coalesce(p_cells,'[]'::jsonb)) c
  ),
  bs as (select strike, sum(dg) g from cells group by strike),
  cum0 as (select strike, sum(g) over (order by strike) c from bs),
  cum as (select strike, c, lag(c) over (order by strike) pc from cum0)
  select (select coalesce(sum(dg),0) from cells),
         (select coalesce(sum(abs(dg)),0) from cells),
         (select coalesce(sum(coi),0)::bigint from cells), (select coalesce(sum(poi),0)::bigint from cells),
         (select count(*) from cells), (select count(distinct expiry) from cells),
         (select strike from bs where strike > p_spot order by g desc limit 1),
         (select strike from bs where strike < p_spot order by g asc  limit 1),
         (select strike from cum where pc is not null and ((pc < 0 and c >= 0) or (pc > 0 and c <= 0)) order by abs(strike - p_spot) limit 1)
    into v_net, v_gross, v_coi, v_poi, v_contracts, v_expiries, v_cw, v_pw, v_zg;

  v_regime := case when v_gross = 0 then 'flat'
                   when v_net >  0.05*v_gross then 'positive'
                   when v_net < -0.05*v_gross then 'negative' else 'flat' end;

  insert into market.chain_snapshots (symbol, as_of, spot, net_gex, zero_gamma, call_wall, put_wall, regime,
         total_call_oi, total_put_oi, put_call_oi_ratio, contracts, expiries, meta)
  values (p_symbol, p_as_of, p_spot, v_net, v_zg, v_cw, v_pw, v_regime,
         v_coi, v_poi, case when v_coi>0 then round(v_poi::numeric/v_coi,3) end, v_contracts, v_expiries,
         jsonb_build_object('gross_gex', v_gross))
  on conflict (symbol, as_of) do nothing
  returning id into v_snap;

  if v_snap is null then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('symbol', p_symbol, 'as_of', p_as_of, 'deduped', true),
                              'meta', jsonb_build_object('took_ms', round(extract(epoch from clock_timestamp()-t0)*1000)));
  end if;

  insert into market.gamma_grid (snapshot_id, symbol, as_of, expiry, strike, call_oi, put_oi, call_gamma, put_gamma, call_vol, put_vol, dealer_gex)
  select v_snap, p_symbol, p_as_of, (c->>'e')::date, (c->>'k')::numeric,
         nullif(c->>'coi','')::numeric::bigint, nullif(c->>'poi','')::numeric::bigint,
         nullif(c->>'cg','')::numeric, nullif(c->>'pg','')::numeric,
         nullif(c->>'cv','')::numeric::bigint, nullif(c->>'pv','')::numeric::bigint,
         round((coalesce((c->>'cg')::numeric,0)*coalesce((c->>'coi')::numeric,0)
              - coalesce((c->>'pg')::numeric,0)*coalesce((c->>'poi')::numeric,0)) * 100 * p_spot*p_spot * 0.01, 2)
    from jsonb_array_elements(coalesce(p_cells,'[]'::jsonb)) c
  on conflict (snapshot_id, expiry, strike) do nothing;
  get diagnostics v_written = row_count;

  begin
    perform iris.feed_report('positioning', true, v_written, null, p_symbol, t0,
              jsonb_build_object('symbol', p_symbol, 'net_gex', v_net, 'regime', v_regime), null);
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'snapshot_id', v_snap, 'symbol', p_symbol, 'spot', p_spot, 'net_gex', v_net, 'regime', v_regime,
      'zero_gamma', v_zg, 'call_wall', v_cw, 'put_wall', v_pw, 'cells', v_written, 'expiries', v_expiries),
    'meta', jsonb_build_object('took_ms', round(extract(epoch from clock_timestamp()-t0)*1000)));
end $function$
;

-- ---- market.ingest_chain
CREATE OR REPLACE FUNCTION market.ingest_chain(p_token text, p_symbol text, p_as_of timestamp with time zone, p_spot numeric, p_cells jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ begin perform brain.check_app_token(p_token); return market._ingest_chain(p_symbol, p_as_of, p_spot, p_cells); end $function$
;

-- ---- market.refresh_all
CREATE OR REPLACE FUNCTION market.refresh_all()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare a int; b int; c int; mr jsonb;
begin
  a := market.refresh_technicals();
  perform market.refresh_regime();
  b := market.refresh_decisions();
  c := market.refresh_technical_reads();
  begin mr := market.refresh_macro_read(); exception when others then mr := jsonb_build_object('ok',false,'error',sqlerrm); end;
  return jsonb_build_object('technicals', a, 'decisions', b, 'technical_reads', c, 'macro_read', mr, 'at', now());
end $function$
;

-- ---- market.refresh_decisions
CREATE OR REPLACE FUNCTION market.refresh_decisions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
declare n int; v_maxasof date;
begin
  select max(as_of) into v_maxasof from market.technicals;
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
           else null end as risk_pct
    from d3b
  ),
  d4 as (
    select d3c.*,
      (as_of >= v_maxasof - 3) as g_fresh,
      (n_obs>=60 and close>0 and sma50 is not null) as g_verified,
      (( (case when sign(dir_adj)=sign(s_trend) and abs(s_trend)>0.2 then 1 else 0 end)
        +(case when sign(dir_adj)=sign(s_ma)    and abs(s_ma)>0.2    then 1 else 0 end)
        +(case when sign(dir_adj)=sign(s_mom)   and abs(s_mom)>0.2   then 1 else 0 end)
        +(case when sign(dir_adj)=sign(s_rsi)   and abs(s_rsi)>0.2   then 1 else 0 end)
        +(case when sign(dir_adj)=sign(s_bb)    and abs(s_bb)>0.2    then 1 else 0 end)
        +(case when sign(dir_adj)=sign(s_val)   and abs(s_val)>0.2   then 1 else 0 end)) >= 2
       and direction<>'neutral') as g_multidim
    from d3c
  ),
  d5 as (
    select d4.*,
      (stop_ref is not null) as g_explained,
      jsonb_build_array(
        jsonb_build_object('k','trend','label','Trend structure','s',round(s_trend,3),'points',round(24*s_trend,1),
          'text', case when trend_stack=1 then 'Above the 50 & 200-day'||case when cross_state='golden' then ', golden cross' else '' end
                       when trend_stack=-1 then 'Below the 50 & 200-day'||case when cross_state='death' then ', death cross' else '' end
                       else 'Trend mixed (price between the 50 & 200-day)' end),
        jsonb_build_object('k','ma','label','Distance to 200-day','s',round(s_ma,3),'points',round(10*s_ma,1),
          'text', case when dist_sma200 is null then '200-day not established'
                       else round(100*dist_sma200)||'% '||case when dist_sma200>=0 then 'above' else 'below' end||' the 200-day' end),
        jsonb_build_object('k','mom','label','Momentum (1m/3m)','s',round(s_mom,3),'points',round(20*s_mom,1),
          'text', 'Return '||round(100*coalesce(ret_1m,0))||'% 1m · '||round(100*coalesce(ret_3m,0))||'% 3m'),
        jsonb_build_object('k','rsi','label','RSI(14)','s',round(s_rsi,3),'points',round(16*s_rsi,1),
          'text', 'RSI '||round(coalesce(rsi14,0))||case when rsi14>78 then ' (overbought)' when rsi14<25 then ' (oversold)' else '' end),
        jsonb_build_object('k','bb','label','Bollinger %B','s',round(s_bb,3),'points',round(14*s_bb,1),
          'text', case when bb_pctb is null then 'bands not established'
                       when bb_pctb>1 then 'Above the upper band (%B '||round(bb_pctb,2)||')'
                       when bb_pctb<0 then 'Below the lower band (%B '||round(bb_pctb,2)||')'
                       else '%B '||round(bb_pctb,2)||' within the bands' end),
        jsonb_build_object('k','val','label','Valuation overlay','s',round(s_val,3),'points',round(16*s_val,1),
          'text', case when not has_fund then 'no EDGAR fundamentals'
                       else 'P/S '||coalesce(round(ps,1)::text,'—')||' · P/E '||coalesce(round(pe,1)::text,'—')||' · '||case when profitable then 'profitable' else 'unprofitable' end end)
      ) as factors
    from d4
  )
  insert into market.decisions as t (symbol,as_of,name,close,direction,posture,conviction,conviction_band,dir_score,dir_raw,options_posture,headline,entry_ref,stop_ref,target_ref,rr,risk_pct,regime_state,gate_fresh,gate_multidim,gate_verified,gate_explained,surfaced,status,has_fundamentals,why,factors,computed_at)
  select
    symbol, as_of, coalesce(name,symbol), close, direction,
    case when dir_adj>=45 then 'LONG' when dir_adj>=dz then 'LEAN LONG'
         when dir_adj<=-45 then 'SHORT' when dir_adj<=-dz then 'LEAN SHORT' else 'NEUTRAL' end,
    conviction,
    case when conviction>=70 then 'High' when conviction>=40 then 'Medium' else 'Low' end,
    round(dir_adj,1), round(dir_raw,1),
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
    case when not g_verified then 'insufficient'
         when (g_fresh and g_verified and g_explained and g_multidim and conviction>=35 and direction<>'neutral') then 'actionable'
         else 'watch' end,
    has_fund,
    (select jsonb_agg(e) from (select e from jsonb_array_elements(factors) e order by abs((e->>'points')::numeric) desc limit 3) z),
    factors, now()
  from d5
  on conflict (symbol) do update set
    as_of=excluded.as_of, name=excluded.name, close=excluded.close, direction=excluded.direction, posture=excluded.posture,
    conviction=excluded.conviction, conviction_band=excluded.conviction_band, dir_score=excluded.dir_score, dir_raw=excluded.dir_raw,
    options_posture=excluded.options_posture, headline=excluded.headline,
    entry_ref=excluded.entry_ref, stop_ref=excluded.stop_ref, target_ref=excluded.target_ref, rr=excluded.rr, risk_pct=excluded.risk_pct,
    regime_state=excluded.regime_state, gate_fresh=excluded.gate_fresh, gate_multidim=excluded.gate_multidim,
    gate_verified=excluded.gate_verified, gate_explained=excluded.gate_explained, surfaced=excluded.surfaced, status=excluded.status,
    has_fundamentals=excluded.has_fundamentals, why=excluded.why, factors=excluded.factors, computed_at=now();
  get diagnostics n = row_count;
  return n;
end $function$
;

-- ---- market.refresh_macro_read
CREATE OR REPLACE FUNCTION market.refresh_macro_read()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
declare
  y10 numeric; y2 numeric; y3m numeric; c2s10s numeric; c10y3m numeric;
  reg record; mbreadth numeric; up_ct int; tot_ct int;
  sc int; posture text; conf text; drivers jsonb; narr text;
begin
  select value into y10 from inv.macro where series_id='UST10Y' and source='treasury' order by d desc limit 1;
  select value into y2  from inv.macro where series_id='UST2Y'  and source='treasury' order by d desc limit 1;
  select value into y3m from inv.macro where series_id='UST3M'  and source='treasury' order by d desc limit 1;
  c2s10s := round(y10 - y2, 2); c10y3m := round(y10 - y3m, 2);

  select * into reg from market.regime order by as_of desc limit 1;

  select count(*) filter (where momentum_state in ('up','accelerating_up')), count(*)
    into up_ct, tot_ct from market.technical_reads;
  mbreadth := case when tot_ct>0 then round(up_ct::numeric/tot_ct, 2) else null end;

  -- deterministic risk-on score (0-100)
  sc := greatest(0, least(100,
      50
      + (case when c2s10s < 0 then -20 when c2s10s < 0.2 then -6 when c2s10s > 0.5 then 8 else 3 end)   -- inversion = recession risk
      + (case when c10y3m < 0 then -12 else 4 end)
      + (case when y10 >= 5.0 then -12 when y10 >= 4.5 then -6 when y10 < 3.5 then 8 else 0 end)          -- high rates hurt high-beta
      + (case when reg.state='calm' then 12 when reg.state='shaky' then -14 when reg.state='elevated' then -6 else 0 end)
      + (case when coalesce(reg.mkt_above_sma50,false) then 8 else -8 end)
      + (case when coalesce(mbreadth,0.5) >= 0.6 then 14 when coalesce(mbreadth,0.5) >= 0.4 then 4 else -10 end)
      + (case when reg.gex_regime='positive' then 5 when reg.gex_regime='negative' then -8 else 0 end)
  ));

  posture := case when sc>=68 then 'risk_on' when sc>=57 then 'lean_risk_on'
                  when sc>=43 then 'neutral' when sc>=32 then 'lean_risk_off' else 'risk_off' end;
  conf := case when abs(sc-50) >= 20 then 'high' when abs(sc-50) >= 10 then 'medium' else 'low' end;

  drivers := jsonb_build_array(
    jsonb_build_object('k','yield_curve','v',c2s10s,'read', case when c2s10s<0 then 'inverted — recession warning' when c2s10s<0.2 then 'flat — late-cycle' else 'positively sloped — no recession flag' end,'weight', case when c2s10s<0 then 'bearish' when c2s10s>0.5 then 'bullish' else 'neutral' end),
    jsonb_build_object('k','rates','v',y10,'read', case when y10>=5 then 'restrictive — headwind for high-beta' when y10>=4.5 then 'elevated' when y10<3.5 then 'easy — tailwind' else 'moderate' end,'weight', case when y10>=4.5 then 'bearish' when y10<3.5 then 'bullish' else 'neutral' end),
    jsonb_build_object('k','regime','v',reg.state,'read', coalesce(reg.state,'—')||case when reg.mkt_above_sma50 then ' · proxy above 50-day' else ' · proxy below 50-day' end,'weight', case when reg.state='calm' then 'bullish' when reg.state in ('shaky','elevated') then 'bearish' else 'neutral' end),
    jsonb_build_object('k','breadth','v',mbreadth,'read', case when mbreadth is null then 'no coverage' else round(100*mbreadth)||'% of themed names in uptrend' end,'weight', case when coalesce(mbreadth,0.5)>=0.6 then 'bullish' when coalesce(mbreadth,0.5)<0.4 then 'bearish' else 'neutral' end),
    jsonb_build_object('k','dealer_gamma','v',reg.gex_regime,'read', coalesce(reg.gex_regime,'—')||' gamma','weight', case when reg.gex_regime='positive' then 'bullish' when reg.gex_regime='negative' then 'bearish' else 'neutral' end)
  );

  narr := 'Forward posture: '||upper(replace(posture,'_',' '))||' ('||conf||' confidence). '
    || 'The curve is '||case when c2s10s<0 then 'inverted ('||c2s10s||'), the classic recession warning' when c2s10s<0.2 then 'flat ('||c2s10s||'), late-cycle' else 'positively sloped (2s10s '||c2s10s||'), so no recession signal' end||'; '
    || '10-year at '||y10||'% is '||case when y10>=5 then 'restrictive — a real headwind for high-beta and long-duration growth' when y10>=4.5 then 'elevated' when y10<3.5 then 'easy, a tailwind for risk' else 'moderate' end||'. '
    || 'Market regime is '||coalesce(reg.state,'—')||' with '||case when mbreadth is null then 'thin themed-breadth coverage' else round(100*mbreadth)||'% of the themed universe trending up' end||'. '
    || case when posture in ('risk_on','lean_risk_on') then 'Net: conditions favor leaning into the high-beta themes, sized for the path.'
            when posture='neutral' then 'Net: mixed — selective, wall of worry; let the momentum engine pick spots.'
            else 'Net: defensive — the macro backdrop argues for smaller size and tighter risk on high-beta.' end;

  insert into market.macro_read (rate_10y, curve_2s10s, curve_10y3m, regime_state, breadth_50, mkt_rvol, gex_regime, momentum_breadth, score, posture, confidence, drivers, narrative)
  values (y10, c2s10s, c10y3m, reg.state, reg.breadth_above50, reg.mkt_rvol, reg.gex_regime, mbreadth, sc, posture, conf, drivers, narr);

  return jsonb_build_object('ok', true, 'score', sc, 'posture', posture, 'curve_2s10s', c2s10s, 'rate_10y', y10);
end $function$
;

-- ---- market.refresh_regime
CREATE OR REPLACE FUNCTION market.refresh_regime()
 RETURNS market.regime
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare rec market.regime;
begin
  with dr as (
    select ticker, d, close::numeric/nullif(lag(close::numeric) over (partition by ticker order by d),0)-1 as dret
    from inv.prices
  ),
  mkt as (
    select d, avg(dret) as mret from dr
    where dret is not null and abs(dret) < 0.5
    group by d having count(*) >= 100
  ),
  lvl as (
    select d, mret, exp(sum(ln(1+mret)) over (order by d)) as idx from mkt
  ),
  mv as (
    select d, idx, mret,
      avg(idx) over (order by d rows between 49 preceding and current row) as sma50,
      stddev_pop(mret) over (order by d rows between 19 preceding and current row)*sqrt(252.0) as rvol20,
      idx/nullif(lag(idx,21) over (order by d),0)-1 as ret21,
      row_number() over (order by d desc) as rn
    from lvl
  ),
  cur as (select * from mv where rn=1),
  rvp as (
    select
      (select count(*) from mv m, cur c where m.d > c.d - 180 and m.rvol20 is not null and m.rvol20 <= c.rvol20)::numeric
      / nullif((select count(*) from mv m, cur c where m.d > c.d - 180 and m.rvol20 is not null),0) as pctile
  ),
  br as (
    select
      avg((close>sma50)::int)  filter (where sma50 is not null)  as b50,
      avg((close>sma200)::int) filter (where sma200 is not null) as b200,
      avg((rsi14>50)::int)     filter (where rsi14 is not null)  as brsi,
      avg((ret_1m>0)::int) filter (where ret_1m is not null) - avg((ret_1m<0)::int) filter (where ret_1m is not null) as net1m
    from market.technicals
    where as_of >= (select max(as_of) from market.technicals) - 7
  ),
  cv as (select value as c2s10s from inv.macro where series_id='T10Y2Y' order by d desc limit 1),
  gx as (
    select case
             when count(*)=0 then null
             when avg((regime='positive')::int) >= 0.5 then 'positive'
             when avg((regime='negative')::int) >= 0.5 then 'negative'
             else 'mixed' end as gex
    from market.chain_snapshots s
    where s.symbol in ('SPY','QQQ') and s.as_of >= (current_date - 3)
  ),
  calc as (
    select
      cur.d as as_of, cur.idx, cur.sma50, cur.rvol20, cur.ret21,
      (cur.idx > cur.sma50) as above50,
      coalesce(rvp.pctile,0.5) as rvolp,
      br.b50, br.b200, br.brsi, br.net1m,
      cv.c2s10s, gx.gex,
      br.b50 as s_b50,
      coalesce(br.b200, br.b50) as s_b200,
      least(1,greatest(0, 0.5 + (cur.idx/nullif(cur.sma50,0)-1)/0.05)) as s_trend,
      (1 - coalesce(rvp.pctile,0.5)) as s_vol,
      least(1,greatest(0, 0.5 + coalesce(cv.c2s10s,0.5)/1.0)) as s_curve,
      least(1,greatest(0, 0.5 + coalesce(br.net1m,0)/1.0)) as s_thrust
    from cur, rvp, br, cv, gx
  )
  insert into market.regime as t (as_of,state,stability,shaky,breadth_above50,breadth_above200,breadth_rsi_bull,net_1m,mkt_ret_1m,mkt_rvol,mkt_rvol_pctile,mkt_above_sma50,curve_2s10s,gex_regime,factors,computed_at)
  select
    as_of,
    case when stab>=70 then 'calm' when stab>=50 then 'normal' when stab>=30 then 'elevated' else 'shaky' end,
    stab,
    (stab < 50),
    round(b50,4), round(s_b200,4), round(brsi,4), round(net1m,4),
    round(ret21,4), round(rvol20,4), round(rvolp,4), above50,
    c2s10s, gex,
    jsonb_build_object(
      'weights', jsonb_build_object('breadth50',25,'breadth200',15,'trend',15,'rvol',25,'curve',10,'thrust',10),
      'subscores', jsonb_build_object('breadth50',round(s_b50,3),'breadth200',round(s_b200,3),'trend',round(s_trend,3),'rvol',round(s_vol,3),'curve',round(s_curve,3),'thrust',round(s_thrust,3)),
      'contrib', jsonb_build_object('breadth50',round(25*s_b50,1),'breadth200',round(15*s_b200,1),'trend',round(15*s_trend,1),'rvol',round(25*s_vol,1),'curve',round(10*s_curve,1),'thrust',round(10*s_thrust,1)),
      'explain', concat_ws(' · ',
        round(100*b50)||'% of stocks above their 50-day',
        round(100*coalesce(s_b200,b50))||'% above their 200-day',
        'proxy vol '||round(100*rvol20)||'% ('||round(100*rvolp)||'th pctile of its own 6mo)',
        case when above50 then 'market proxy above its 50-day trend' else 'market proxy below its 50-day trend' end,
        '2s10s '||coalesce(round(c2s10s,2)::text,'n/a'),
        coalesce('dealer GEX '||gex,'GEX n/a'))
    ) as factors,
    now()
  from (
    select c.*, round(25*s_b50 + 15*s_b200 + 15*s_trend + 25*s_vol + 10*s_curve + 10*s_thrust)::int as stab
    from calc c
  ) z
  on conflict (as_of) do update set
    state=excluded.state, stability=excluded.stability, shaky=excluded.shaky,
    breadth_above50=excluded.breadth_above50, breadth_above200=excluded.breadth_above200, breadth_rsi_bull=excluded.breadth_rsi_bull,
    net_1m=excluded.net_1m, mkt_ret_1m=excluded.mkt_ret_1m, mkt_rvol=excluded.mkt_rvol, mkt_rvol_pctile=excluded.mkt_rvol_pctile,
    mkt_above_sma50=excluded.mkt_above_sma50, curve_2s10s=excluded.curve_2s10s, gex_regime=excluded.gex_regime,
    factors=excluded.factors, computed_at=now()
  returning * into rec;
  return rec;
end $function$
;

-- ---- market.refresh_signals
CREATE OR REPLACE FUNCTION market.refresh_signals()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare n int;
begin
  create temp table _prev on commit drop as
    select dedupe_key, conviction, direction from market.signals;
  -- explicit WHERE: PostgREST's pg-safeupdate blocks unqualified DELETE on the REST path
  delete from market.signals where symbol in (select symbol from market.underlyings);

  with latest as (
    select s.* from market.chain_snapshots s
    where s.as_of = (select max(as_of) from market.chain_snapshots s2 where s2.symbol = s.symbol)
  ),
  grid as (
    select g.snapshot_id, g.strike,
           sum(g.dealer_gex) dg, sum(g.call_oi) coi, sum(g.put_oi) poi,
           sum(coalesce(g.call_vol,0)) cv, sum(coalesce(g.put_vol,0)) pv
    from market.gamma_grid g join latest l on l.id = g.snapshot_id
    group by g.snapshot_id, g.strike
  ),
  gsum as (
    select snapshot_id,
      sum(abs(dg)) tot_abs_gex, sum(cv+pv) day_vol,
      (array_agg(strike order by abs(dg) desc))[1] pin_strike,
      (array_agg(dg     order by abs(dg) desc))[1] pin_gex,
      (array_agg(strike order by (cv+pv) desc))[1] flow_strike,
      (array_agg(cv     order by (cv+pv) desc))[1] flow_cv,
      (array_agg(pv     order by (cv+pv) desc))[1] flow_pv,
      (array_agg(coi+poi order by (cv+pv) desc))[1] flow_oi
    from grid group by snapshot_id
  ),
  feat as (
    select l.id, l.symbol, l.as_of, l.spot, l.net_gex, l.zero_gamma, l.call_wall, l.put_wall,
           l.regime, l.contracts, l.expiries, (l.total_call_oi + l.total_put_oi) as tot_oi,
           un.priority, un.name un_name,
           gs.tot_abs_gex, gs.day_vol, gs.pin_strike, gs.pin_gex,
           gs.flow_strike, gs.flow_cv, gs.flow_pv, gs.flow_oi,
           extract(epoch from (now() - l.as_of)) as age_s,
           case when l.call_wall is not null and l.spot>0 then (l.call_wall - l.spot)/l.spot end as cw_dist,
           case when l.put_wall  is not null and l.spot>0 then (l.spot - l.put_wall)/l.spot end as pw_dist,
           case when l.zero_gamma is not null and l.spot>0 then abs(l.spot - l.zero_gamma)/l.spot end as zg_dist,
           case when l.spot>0 and gs.pin_strike is not null then abs(l.spot - gs.pin_strike)/l.spot end as pin_dist,
           case when gs.day_vol is not null and (l.total_call_oi+l.total_put_oi)>0
                then gs.day_vol::numeric/(l.total_call_oi+l.total_put_oi) end as vol_confirm
    from latest l
    join market.underlyings un on un.symbol = l.symbol
    left join gsum gs on gs.snapshot_id = l.id
  ),
  cand as (
    select f.symbol, 'gamma_regime'::text kind, 'amplifying'::text behavior, 0 direction,
      45 + least(45, abs(f.net_gex)/3e9*45) + (case when f.zero_gamma is not null and f.spot < f.zero_gamma then 10 else 0 end) as conv,
      (1 + (case when f.pw_dist is not null and f.pw_dist <= 0.02 then 1 else 0 end)
         + (case when coalesce(f.vol_confirm,0) >= 0.35 then 1 else 0 end)) as confirmations,
      'Dealers are short gamma (net GEX '||market._gexfmt(f.net_gex)||') — hedging amplifies moves rather than damping them. Put wall $'||round(f.put_wall)||' is the support that accelerates on a break; rallies stall into the call wall $'||round(f.call_wall)||'.' as headline,
      'Amplification eases if net GEX turns positive'||coalesce(' (spot reclaims $'||round(f.zero_gamma)||')','') as invalidation,
      jsonb_build_array(
        jsonb_build_object('k','net_gex','label','Net dealer gamma','text', market._gexfmt(f.net_gex)||' (short-gamma / amplifying)'),
        jsonb_build_object('k','walls','label','Key levels','text','Support $'||round(f.put_wall)||' · resistance $'||round(f.call_wall)),
        jsonb_build_object('k','flow','label','Volume vs OI','text', round(coalesce(f.vol_confirm,0),2)||'× day volume / open interest')
      ) as factors
    from feat f where f.net_gex < 0

    union all
    select f.symbol, 'pin'::text, 'pinning'::text, 0,
      45 + coalesce(abs(f.pin_gex)/nullif(f.tot_abs_gex,0),0)*30 + (0.02 - least(0.02,coalesce(f.pin_dist,1)))/0.02*25,
      (1 + (case when f.regime='positive' then 1 else 0 end)
         + (case when coalesce(abs(f.pin_gex)/nullif(f.tot_abs_gex,0),0) >= 0.15 then 1 else 0 end)),
      'Positive dealer gamma pins price toward $'||round(f.pin_strike)||' (the largest gamma concentration) — expect mean-reversion, not trend, between put wall $'||round(f.put_wall)||' and call wall $'||round(f.call_wall)||'.',
      'Pin breaks if spot closes outside $'||round(f.put_wall)||'–$'||round(f.call_wall),
      jsonb_build_array(
        jsonb_build_object('k','pin','label','Pin strike','text','$'||round(f.pin_strike)||' holds '||round(100*coalesce(abs(f.pin_gex)/nullif(f.tot_abs_gex,0),0))||'% of gamma'),
        jsonb_build_object('k','proximity','label','Distance to pin','text', round(100*coalesce(f.pin_dist,0),2)||'% away'),
        jsonb_build_object('k','regime','label','Gamma regime','text','positive / suppressing')
      )
    from feat f where f.net_gex > 0 and f.pin_strike is not null and coalesce(f.pin_dist,1) <= 0.02

    union all
    select f.symbol, 'flip'::text, 'flip_risk'::text, 0,
      58 + (0.025 - least(0.025,f.zg_dist))/0.025*30 + least(12, abs(f.net_gex)/2e9*12),
      (1 + (case when abs(f.net_gex) >= 1e9 then 1 else 0 end)
         + (case when f.regime <> 'neutral' then 1 else 0 end)),
      'Spot $'||round(f.spot,2)||' sits '||round(100*f.zg_dist,2)||'% from the gamma flip $'||round(f.zero_gamma)||' — the level dividing dealer suppression (above) from amplification (below). Volatility changes character on a cross.',
      'Regime flips on a close through $'||round(f.zero_gamma),
      jsonb_build_array(
        jsonb_build_object('k','flip','label','Flip level','text','$'||round(f.zero_gamma)||' vs spot $'||round(f.spot,2)),
        jsonb_build_object('k','side','label','Current side','text', case when f.spot >= f.zero_gamma then 'above — suppressed' else 'below — amplified' end),
        jsonb_build_object('k','net_gex','label','Net dealer gamma','text', market._gexfmt(f.net_gex))
      )
    from feat f where f.zero_gamma is not null and f.zg_dist <= 0.025

    union all
    select f.symbol, 'call_wall'::text, 'resistance'::text, -1,
      50 + (0.015 - least(0.015,f.cw_dist))/0.015*30 + (case when f.net_gex > 0 then 15 else 0 end),
      (1 + (case when f.net_gex > 0 then 1 else 0 end)
         + (case when coalesce(f.vol_confirm,0) >= 0.30 then 1 else 0 end)),
      'Spot $'||round(f.spot,2)||' is testing the call wall $'||round(f.call_wall)||' — the largest call-gamma strike, where dealer selling caps rallies'||case when f.net_gex>0 then ' (reinforced by positive gamma)' else '' end||'.',
      'Resistance fails on a close above $'||round(f.call_wall),
      jsonb_build_array(
        jsonb_build_object('k','wall','label','Call wall','text','$'||round(f.call_wall)||', '||round(100*f.cw_dist,2)||'% overhead'),
        jsonb_build_object('k','regime','label','Gamma regime','text', f.regime),
        jsonb_build_object('k','flow','label','Volume vs OI','text', round(coalesce(f.vol_confirm,0),2)||'×')
      )
    from feat f where f.call_wall is not null and f.spot <= f.call_wall and f.cw_dist <= 0.015

    union all
    select f.symbol, 'put_wall'::text, 'support'::text, 1,
      50 + (0.015 - least(0.015,f.pw_dist))/0.015*30 + (case when f.net_gex > 0 then 15 else 8 end),
      (1 + (case when f.net_gex < 0 then 1 else 0 end)
         + (case when coalesce(f.vol_confirm,0) >= 0.30 then 1 else 0 end)),
      'Spot $'||round(f.spot,2)||' is testing the put wall $'||round(f.put_wall)||' — the largest put-gamma strike, where dealer buying supports'||case when f.net_gex<0 then ' — but in negative gamma a break ACCELERATES lower' else '' end||'.',
      'Support fails on a close below $'||round(f.put_wall),
      jsonb_build_array(
        jsonb_build_object('k','wall','label','Put wall','text','$'||round(f.put_wall)||', '||round(100*f.pw_dist,2)||'% below'),
        jsonb_build_object('k','regime','label','Gamma regime','text', f.regime),
        jsonb_build_object('k','flow','label','Volume vs OI','text', round(coalesce(f.vol_confirm,0),2)||'×')
      )
    from feat f where f.put_wall is not null and f.spot >= f.put_wall and f.pw_dist <= 0.015

    union all
    select f.symbol, 'flow'::text, 'accumulation'::text,
      (case when coalesce(f.flow_cv,0) >= coalesce(f.flow_pv,0) then 1 else -1 end),
      35 + least(25, (coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0))::numeric/nullif(f.flow_oi,0)*18) + least(10, (coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0))/8000.0*10),
      (1 + (case when (coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0))::numeric/nullif(f.flow_oi,0) >= 0.9 then 1 else 0 end)
         + (case when abs(coalesce(f.flow_cv,0)-coalesce(f.flow_pv,0))::numeric/nullif(coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0),0) >= 0.3 then 1 else 0 end)),
      'Unusual flow at $'||round(f.flow_strike)||' — '||(coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0))||' contracts today against '||f.flow_oi||' open interest ('||round((coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0))::numeric/nullif(f.flow_oi,0),1)||'×), '||case when coalesce(f.flow_cv,0) >= coalesce(f.flow_pv,0) then 'call-heavy (bullish tilt)' else 'put-heavy (bearish tilt)' end||'.',
      'Flow signal fades if volume normalizes on the next session',
      jsonb_build_array(
        jsonb_build_object('k','strike','label','Busiest strike','text','$'||round(f.flow_strike)),
        jsonb_build_object('k','voloi','label','Volume / OI','text', round((coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0))::numeric/nullif(f.flow_oi,0),1)||'× ('||(coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0))||' vs '||f.flow_oi||')'),
        jsonb_build_object('k','tilt','label','Call/put split','text', coalesce(f.flow_cv,0)||' calls / '||coalesce(f.flow_pv,0)||' puts')
      )
    from feat f where f.flow_oi > 0 and (coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0)) >= 500
      and (coalesce(f.flow_cv,0)+coalesce(f.flow_pv,0))::numeric/nullif(f.flow_oi,0) >= 0.6
  ),
  scored as (
    select c.*, f.as_of, f.priority, f.spot, f.net_gex, f.zero_gamma, f.call_wall, f.put_wall,
           f.pin_strike, f.regime, f.contracts, f.expiries, f.tot_oi, f.age_s, f.vol_confirm,
           round(greatest(0, least(100, c.conv)))::int as conviction,
           (f.age_s <= 12600) as g_fresh,
           (f.contracts >= 150 and f.expiries >= 2 and f.tot_oi >= 20000) as g_verified,
           (c.confirmations >= 2) as g_multidim
    from cand c join feat f on f.symbol = c.symbol
  ),
  ranked as (
    select s.*,
      round(greatest(0, least(1,
        0.55 - s.conviction/200.0 - least(0.20, coalesce(s.vol_confirm,0))
        + (case when not s.g_verified then 0.30 else 0 end)
        + (case when s.confirmations < 2 then 0.15 else 0 end)))::numeric, 3) as noise_prob,
      row_number() over (partition by s.symbol order by s.conviction desc) as rnk
    from scored s
  )
  insert into market.signals
    (symbol, as_of, kind, behavior, direction, conviction, conviction_band, novelty, noise_prob,
     regime, confirmations, gate_fresh, gate_multidim, gate_verified, gate_explained, surfaced,
     gate_detail, evidence, factors, invalidation, headline, status, dedupe_key)
  select
    r.symbol, r.as_of, r.kind, r.behavior, r.direction, r.conviction,
    case when r.conviction >= 70 then 'High' when r.conviction >= 45 then 'Medium' else 'Low' end,
    case when p.dedupe_key is null then 1.0
         when p.direction is distinct from r.direction then 0.85
         when abs(p.conviction - r.conviction) >= 10 then 0.6 else 0.3 end,
    r.noise_prob, r.regime, r.confirmations,
    r.g_fresh, r.g_multidim, r.g_verified, true,
    (r.g_fresh and r.g_verified and r.g_multidim and r.conviction >= 45 and r.noise_prob <= 0.5 and r.rnk <= 2),
    jsonb_build_object(
      'fresh', jsonb_build_object('pass', r.g_fresh, 'age_min', round(r.age_s/60.0)),
      'verified', jsonb_build_object('pass', r.g_verified, 'contracts', r.contracts, 'expiries', r.expiries, 'oi', r.tot_oi),
      'multidim', jsonb_build_object('pass', r.g_multidim, 'confirmations', r.confirmations),
      'explained', jsonb_build_object('pass', true)),
    jsonb_build_object('spot', r.spot, 'net_gex', r.net_gex, 'zero_gamma', r.zero_gamma,
      'call_wall', r.call_wall, 'put_wall', r.put_wall, 'pin_strike', r.pin_strike,
      'contracts', r.contracts, 'expiries', r.expiries, 'as_of', r.as_of),
    r.factors, r.invalidation, r.headline,
    case when (r.g_fresh and r.g_verified and r.g_multidim and r.conviction >= 45 and r.noise_prob <= 0.5 and r.rnk <= 2) then 'active'
         when r.g_fresh and r.g_verified then 'watch' else 'muted' end,
    r.symbol||':'||r.kind
  from ranked r
  left join _prev p on p.dedupe_key = r.symbol||':'||r.kind;

  get diagnostics n = row_count;
  return n;
end $function$
;

-- ---- market.refresh_technical_reads
CREATE OR REPLACE FUNCTION market.refresh_technical_reads()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
declare n int;
begin
  create temp table _uni on commit drop as
    select distinct symbol from (
      select symbol from market.theme_symbols
      union select symbol from market.underlyings where active
    ) u
    where (select count(*) from inv.prices p where p.ticker=u.symbol) >= 60;

  delete from market.technical_reads where symbol in (select symbol from _uni);

  with px as (
    select p.ticker sym, p.d, p.close,
           row_number() over (partition by p.ticker order by p.d) rn,
           count(*) over (partition by p.ticker) nbars
    from inv.prices p join _uni u on u.symbol=p.ticker where p.close is not null
  ),
  dwin as (
    select sym, d, close, rn, nbars,
      avg(close) over w20 sma20, avg(close) over w50 sma50,
      close - lag(close) over (partition by sym order by d) delta,
      max(close) over w252 hi52, min(close) over w252 lo52,
      close / nullif(lag(close,21) over (partition by sym order by d),0) - 1 roc_1m,
      close / nullif(lag(close,63) over (partition by sym order by d),0) - 1 roc_3m
    from px
    window w20 as (partition by sym order by d rows between 19 preceding and current row),
           w50 as (partition by sym order by d rows between 49 preceding and current row),
           w252 as (partition by sym order by d rows between 251 preceding and current row)
  ),
  drsi as (
    select sym, d, close, sma20, sma50, roc_1m, roc_3m, hi52, lo52, rn, nbars,
      avg(greatest(delta,0)) over w14 ag, avg(greatest(-delta,0)) over w14 al
    from dwin
    window w14 as (partition by sym order by d rows between 13 preceding and current row)
  ),
  daily as (  -- latest daily row per symbol
    select distinct on (sym) sym, d as as_of, close, sma20, sma50, roc_1m, roc_3m, nbars,
      case when al>0 then round(100 - 100/(1+ag/al),1) when ag>0 then 100 else 50 end d_rsi,
      case when hi52>lo52 then round((close-lo52)/(hi52-lo52),3) end pos_52w
    from drsi order by sym, d desc
  ),
  wk as (  -- weekly resample: last close per ISO week
    select sym, wk, close from (
      select sym, date_trunc('week', d) wk, close,
             row_number() over (partition by sym, date_trunc('week', d) order by d desc) r
      from px
    ) z where r=1
  ),
  wwin as (
    select sym, wk, close,
      avg(close) over w10 wsma10, avg(close) over w20 wsma20,
      close - lag(close) over (partition by sym order by wk) wdelta
    from wk
    window w10 as (partition by sym order by wk rows between 9 preceding and current row),
           w20 as (partition by sym order by wk rows between 19 preceding and current row)
  ),
  wrsi as (
    select sym, wk, close, wsma10, wsma20,
      avg(greatest(wdelta,0)) over w14 wag, avg(greatest(-wdelta,0)) over w14 wal
    from wwin window w14 as (partition by sym order by wk rows between 13 preceding and current row)
  ),
  weekly as (
    select distinct on (sym) sym, wsma10, wsma20,
      case when wal>0 then round(100-100/(1+wag/wal),1) when wag>0 then 100 else 50 end w_rsi,
      case when close>wsma10 and wsma10>wsma20 then 'up' when close<wsma10 and wsma10<wsma20 then 'down' else 'mixed' end w_trend,
      close w_close
    from wrsi order by sym, wk desc
  ),
  synth as (
    select d.sym, d.as_of, d.close, d.d_rsi, d.sma20, d.sma50, d.roc_1m, d.roc_3m, d.pos_52w, d.nbars,
      w.w_rsi, w.wsma10, w.wsma20, w.w_trend,
      -- deterministic momentum score 0-100
      greatest(0, least(100,
          (case when d.close>d.sma20 and d.sma20>d.sma50 then 25 when d.close>d.sma20 then 12 when d.close<d.sma50 then 0 else 6 end)
        + (case when w.w_trend='up' then 25 when w.w_trend='mixed' then 10 else 0 end)
        + (case when d.d_rsi between 55 and 70 then 15 when d.d_rsi>70 then 8 when d.d_rsi between 45 and 55 then 7 else 0 end)
        + (case when coalesce(d.roc_1m,0)>0 and coalesce(d.roc_3m,0)>0 then 20 when coalesce(d.roc_1m,0)>0 or coalesce(d.roc_3m,0)>0 then 9 else 0 end)
        + (case when d.close>d.sma20 and w.w_trend='up' then 15 else 0 end)
      ))::int mscore
    from daily d left join weekly w on w.sym=d.sym
  )
  insert into market.technical_reads
    (symbol, as_of, close, d_rsi14, d_sma20, d_sma50, d_roc_1m, d_roc_3m, pos_52w, n_bars,
     w_rsi14, w_sma10, w_sma20, w_trend, momentum_score, momentum_state, direction, read, factors, computed_at)
  select s.sym, s.as_of, round(s.close,2), s.d_rsi, round(s.sma20,2), round(s.sma50,2),
    round(s.roc_1m,4), round(s.roc_3m,4), s.pos_52w, s.nbars,
    s.w_rsi, round(s.wsma10,2), round(s.wsma20,2), s.w_trend, s.mscore,
    case when s.mscore>=72 then 'accelerating_up' when s.mscore>=56 then 'up'
         when s.mscore>=44 then 'neutral' when s.mscore>=28 then 'down' else 'accelerating_down' end,
    case when s.mscore>=56 then 1 when s.mscore<44 then -1 else 0 end,
    -- plain-English read
    (case when s.mscore>=72 then 'Strong momentum, multi-timeframe aligned. '
          when s.mscore>=56 then 'Constructive momentum. '
          when s.mscore>=44 then 'Mixed / rangebound. '
          when s.mscore>=28 then 'Momentum rolling over. '
          else 'Weak — downtrend. ' end)
    || 'Daily '|| case when s.close>s.sma20 and s.sma20>s.sma50 then 'above the 20 & 50-day' when s.close>s.sma20 then 'above the 20-day, below the 50' else 'below key MAs' end
    || ' (RSI '||round(coalesce(s.d_rsi,0))||'); weekly trend '||coalesce(s.w_trend,'—')||' (RSI '||round(coalesce(s.w_rsi,0))||'). '
    || 'Return '||round(100*coalesce(s.roc_1m,0))||'% 1m · '||round(100*coalesce(s.roc_3m,0))||'% 3m'
    || case when s.pos_52w is not null then ' · '||round(100*s.pos_52w)||'% of 52w range' else '' end||'.',
    jsonb_build_object(
      'daily_trend', case when s.close>s.sma20 and s.sma20>s.sma50 then 'up-stacked' when s.close>s.sma20 then 'above-20' else 'below' end,
      'weekly_trend', s.w_trend, 'd_rsi', s.d_rsi, 'w_rsi', s.w_rsi,
      'roc_1m_pct', round(100*coalesce(s.roc_1m,0),1), 'roc_3m_pct', round(100*coalesce(s.roc_3m,0),1),
      'pos_52w_pct', case when s.pos_52w is not null then round(100*s.pos_52w) end),
    now()
  from synth s;
  get diagnostics n = row_count;
  return n;
end $function$
;

-- ---- market.refresh_technicals
CREATE OR REPLACE FUNCTION market.refresh_technicals()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
declare n int;
begin
  with elig as (
    select ticker from inv.prices group by ticker having count(*) >= 60
  ),
  base as (
    select p.ticker, p.d, p.close::numeric as close, p.volume::numeric as volume,
           lag(p.close::numeric) over wo as prev_close,
           ln(p.close::numeric / nullif(lag(p.close::numeric) over wo,0)) as logret,
           greatest(p.close::numeric - lag(p.close::numeric) over wo, 0) as gain,
           greatest(lag(p.close::numeric) over wo - p.close::numeric, 0) as loss
    from inv.prices p join elig e on e.ticker = p.ticker
    window wo as (partition by p.ticker order by p.d)
  ),
  w as (
    select b.*,
      count(*)          over w20  as c20,
      avg(close)        over w20  as sma20,
      stddev_pop(close) over w20  as sd20,
      count(*)          over w50  as c50,
      avg(close)        over w50  as sma50,
      count(*)          over w200 as c200,
      avg(close)        over w200 as sma200,
      count(*)          over w14  as c14,
      avg(gain)         over w14  as ag14,
      avg(loss)         over w14  as al14,
      avg(abs(close - prev_close)/nullif(prev_close,0)) over w14 as dvol14,
      stddev_pop(logret) over w20 as sdlr20,
      count(*)          over w252 as c252,
      max(close)        over w252 as hi252,
      min(close)        over w252 as lo252,
      avg(volume)       over w20  as vavg20,
      stddev_pop(volume) over w20 as vsd20,
      lag(close, 5)   over wo as c_5,
      lag(close, 21)  over wo as c_21,
      lag(close, 63)  over wo as c_63,
      lag(close, 126) over wo as c_126
    from base b
    window
      wo   as (partition by ticker order by d),
      w14  as (partition by ticker order by d rows between 13 preceding and current row),
      w20  as (partition by ticker order by d rows between 19 preceding and current row),
      w50  as (partition by ticker order by d rows between 49 preceding and current row),
      w200 as (partition by ticker order by d rows between 199 preceding and current row),
      w252 as (partition by ticker order by d rows between 251 preceding and current row)
  ),
  x as (
    select w.*,
      lag(case when c50>=50 then sma50 end, 20)   over wo as sma50_20a,
      lag(case when c200>=200 then sma200 end, 20) over wo as sma200_20a,
      count(*)     over (partition by ticker) as nobs,
      row_number() over (partition by ticker order by d desc) as rn
    from w
    window wo as (partition by ticker order by d)
  ),
  up as (
    select
      ticker as symbol, d as as_of, close, prev_close,
      case when prev_close>0 then close/prev_close-1 end as chg_1d,
      case when c20>=20 then sma20 end as sma20,
      case when c50>=50 then sma50 end as sma50,
      case when c200>=200 then sma200 end as sma200,
      case when c20>=20 then sma20 end as bb_mid,
      case when c20>=20 then sma20 + 2*sd20 end as bb_upper,
      case when c20>=20 then sma20 - 2*sd20 end as bb_lower,
      case when c20>=20 and sd20>0 then (close - (sma20 - 2*sd20))/(4*sd20) end as bb_pctb,
      case when c20>=20 and sma20>0 then (4*sd20)/sma20 end as bb_bw,
      case when c14>=14 then (case when al14=0 then 100 else 100 - 100/(1 + ag14/nullif(al14,0)) end) end as rsi14,
      case when c_5>0   then close/c_5-1   end as ret_1w,
      case when c_21>0  then close/c_21-1  end as ret_1m,
      case when c_63>0  then close/c_63-1  end as ret_3m,
      case when c_126>0 then close/c_126-1 end as ret_6m,
      case when c252>=100 then hi252 end as hi_52w,
      case when c252>=100 then lo252 end as lo_52w,
      case when c252>=100 and hi252>lo252 then (close-lo252)/(hi252-lo252) end as pos_52w,
      case when sdlr20 is not null then sdlr20*sqrt(252) end as rvol_20,
      dvol14 as dvol_pct14,
      vavg20 as vol_avg20,
      case when vsd20>0 then (volume - vavg20)/vsd20 end as vol_z,
      case when c50>=50 and sma50>0 then close/sma50-1 end as dist_sma50,
      case when c200>=200 and sma200>0 then close/sma200-1 end as dist_sma200,
      case when c50>=50 and c200>=200 then
        case when close>sma50 and sma50>sma200 then 1
             when close<sma50 and sma50<sma200 then -1 else 0 end end as trend_stack,
      case when c200>=200 and sma50_20a is not null and sma200_20a is not null then
        case when sma50>sma200 and sma50_20a<=sma200_20a then 'golden'
             when sma50<sma200 and sma50_20a>=sma200_20a then 'death' end end as cross_state,
      nobs::int as n_obs
    from x where rn=1
  )
  insert into market.technicals as t (symbol,as_of,close,prev_close,chg_1d,sma20,sma50,sma200,bb_mid,bb_upper,bb_lower,bb_pctb,bb_bw,rsi14,ret_1w,ret_1m,ret_3m,ret_6m,hi_52w,lo_52w,pos_52w,rvol_20,dvol_pct14,vol_avg20,vol_z,dist_sma50,dist_sma200,trend_stack,cross_state,n_obs,computed_at)
  select symbol,as_of,close,prev_close,chg_1d,sma20,sma50,sma200,bb_mid,bb_upper,bb_lower,bb_pctb,bb_bw,rsi14,ret_1w,ret_1m,ret_3m,ret_6m,hi_52w,lo_52w,pos_52w,rvol_20,dvol_pct14,vol_avg20,vol_z,dist_sma50,dist_sma200,trend_stack,cross_state,n_obs, now()
  from up
  on conflict (symbol) do update set
    as_of=excluded.as_of, close=excluded.close, prev_close=excluded.prev_close, chg_1d=excluded.chg_1d,
    sma20=excluded.sma20, sma50=excluded.sma50, sma200=excluded.sma200,
    bb_mid=excluded.bb_mid, bb_upper=excluded.bb_upper, bb_lower=excluded.bb_lower, bb_pctb=excluded.bb_pctb, bb_bw=excluded.bb_bw,
    rsi14=excluded.rsi14, ret_1w=excluded.ret_1w, ret_1m=excluded.ret_1m, ret_3m=excluded.ret_3m, ret_6m=excluded.ret_6m,
    hi_52w=excluded.hi_52w, lo_52w=excluded.lo_52w, pos_52w=excluded.pos_52w, rvol_20=excluded.rvol_20, dvol_pct14=excluded.dvol_pct14,
    vol_avg20=excluded.vol_avg20, vol_z=excluded.vol_z, dist_sma50=excluded.dist_sma50, dist_sma200=excluded.dist_sma200,
    trend_stack=excluded.trend_stack, cross_state=excluded.cross_state, n_obs=excluded.n_obs, computed_at=now();
  get diagnostics n = row_count;
  return n;
end $function$
;

-- ---- public.iris2_investing
CREATE OR REPLACE FUNCTION public.iris2_investing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '8s'
AS $function$
declare t0 timestamptz := clock_timestamp();
declare v_asof date;
begin
  perform brain.require_scope('investing');
  select max(as_of) into v_asof from market.decisions;
  return iris2._ok(jsonb_build_object(
    'as_of', v_asof,
    'regime', (select to_jsonb(r) from (
        select state, stability, shaky, breadth_above50, breadth_above200, breadth_rsi_bull, net_1m,
               mkt_ret_1m, mkt_rvol, mkt_rvol_pctile, mkt_above_sma50, curve_2s10s, gex_regime,
               factors->>'explain' as explain, factors->'contrib' as contrib, as_of
        from market.regime order by as_of desc limit 1) r),
    'counts', jsonb_build_object(
        'actionable', (select count(*) from market.decisions where surfaced),
        'longs',  (select count(*) from market.decisions where surfaced and direction='long'),
        'shorts', (select count(*) from market.decisions where surfaced and direction='short'),
        'universe', (select count(*) from market.decisions)),
    'watchlist', (select coalesce(jsonb_agg(card order by pr), '[]'::jsonb) from (
        select u.priority as pr,
          case when d.symbol is null then
            jsonb_build_object('symbol', u.symbol, 'name', u.name, 'status', 'no_price_data',
              'note', case when u.kind='etf' then 'ETF price feed not connected' else 'no price history' end)
          else market._decision_card(d.symbol) end as card
        from market.underlyings u
        left join market.decisions d on d.symbol = u.symbol
        where u.active) w),
    'longs', (select coalesce(jsonb_agg(market._decision_card(symbol) order by conviction desc), '[]'::jsonb) from (
        select d.symbol, d.conviction from market.decisions d join market.technicals te on te.symbol=d.symbol
        where d.surfaced and d.direction='long' and d.close>=5 and coalesce(te.close*te.vol_avg20,0) >= 20000000
        order by d.conviction desc limit 12) a),
    'shorts', (select coalesce(jsonb_agg(market._decision_card(symbol) order by conviction desc), '[]'::jsonb) from (
        select d.symbol, d.conviction from market.decisions d join market.technicals te on te.symbol=d.symbol
        where d.surfaced and d.direction='short' and d.close>=5 and coalesce(te.close*te.vol_avg20,0) >= 20000000
        order by d.conviction desc limit 12) b),
    'freshness', jsonb_build_object(
        'prices_as_of', (select max(d) from inv.prices),
        'prices_stale', (select (current_date - max(d)) > 4 from inv.prices),
        'fundamentals_as_of', (select max(computed_at)::date from inv.fundamentals),
        'macro_as_of', (select max(d) from inv.macro),
        'computed_at', (select max(computed_at) from market.decisions)),
    'scope_note', 'Decisions cover the ' || (select count(*) from market.decisions) || '-stock priced universe (EDGAR). Index ETFs (SPY/QQQ/IWM) need a price source; their dealer-positioning is on the Positioning tab. Prices as of ' || coalesce((select max(d)::text from inv.prices),'—') || ' — decision-support, not advice.'
  ), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$
;

-- ---- public.iris2_investing_security
CREATE OR REPLACE FUNCTION public.iris2_investing_security(p_symbol text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '8s'
AS $function$
declare t0 timestamptz := clock_timestamp(); v_sym text := upper(trim(p_symbol));
begin
  perform brain.require_scope('investing');
  return iris2._ok(jsonb_build_object(
    'decision', market._decision_card(v_sym),
    'technicals', (select to_jsonb(te) from market.technicals te where te.symbol=v_sym),
    'factors', (select factors from market.decisions where symbol=v_sym),
    'fundamentals', (select to_jsonb(f) from (
        select se.name, se.exchange, se.sic_desc, fu.revenue_ttm, fu.net_income_ttm, fu.equity, fu.shares,
               fu.debt, fu.assets, fu.liabilities, fu.cash, fu.revenue_asof
        from inv.securities se left join inv.fundamentals fu on fu.cik=se.cik
        where se.ticker=v_sym order by se.is_active desc nulls last limit 1) f),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('d',d,'c',close) order by d), '[]'::jsonb)
        from (select d, close from inv.prices where ticker=v_sym order by d desc limit 160) h)
  ), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$
;

-- ---- public.iris2_markets
CREATE OR REPLACE FUNCTION public.iris2_markets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
declare t0 timestamptz := clock_timestamp();
begin
  perform brain.require_scope('investing');
  return iris2._ok(iris2._markets(), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$
;

-- ---- public.iris2_markets_screen
CREATE OR REPLACE FUNCTION public.iris2_markets_screen(p_max_ps numeric DEFAULT 3.0, p_max_pb numeric DEFAULT 1.0, p_max_pe numeric DEFAULT NULL::numeric, p_limit integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
declare t0 timestamptz := clock_timestamp(); res jsonb; v_id uuid;
begin
  perform brain.require_scope('investing');
  if coalesce(p_max_ps, 0) <= 0 or coalesce(p_max_pb, 0) <= 0 or (p_max_pe is not null and p_max_pe <= 0) then return iris2._err('invalid', 'thresholds must be positive', t0); end if;
  res := iris2._inv_screen(p_max_ps, p_max_pb, p_max_pe, p_limit);
  insert into inv.screen_runs (name, params, n, results) values ('board', res->'params', (res->>'n')::int, res->'results') returning id into v_id;
  perform ops.audit('markets.screen', 'inv.screen_runs', v_id::text, null, res->'params' || jsonb_build_object('n', res->'n'));
  return iris2._ok(res || jsonb_build_object('screen_run_id', v_id), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$
;

-- ---- public.iris2_positioning
CREATE OR REPLACE FUNCTION public.iris2_positioning()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '8s'
AS $function$
declare t0 timestamptz := clock_timestamp();
begin
  perform brain.require_scope('investing');
  return iris2._ok(jsonb_build_object(
    'underlyings', (
      select coalesce(jsonb_agg(u order by (u->>'priority')::int), '[]'::jsonb) from (
        select jsonb_build_object(
          'symbol', s.symbol, 'priority', un.priority, 'name', un.name,
          'as_of', s.as_of, 'spot', s.spot, 'net_gex', s.net_gex, 'gross_gex', (s.meta->>'gross_gex')::numeric,
          'regime', s.regime, 'call_wall', s.call_wall, 'put_wall', s.put_wall, 'zero_gamma', s.zero_gamma,
          'put_call_oi_ratio', s.put_call_oi_ratio, 'total_call_oi', s.total_call_oi, 'total_put_oi', s.total_put_oi,
          'contracts', s.contracts, 'expiries', s.expiries,
          'lattice', (select coalesce(jsonb_agg(jsonb_build_object('k', g.strike, 'dg', g.dg, 'coi', g.coi, 'poi', g.poi) order by g.strike), '[]'::jsonb)
                        from (select strike, round(sum(dealer_gex)) dg, sum(call_oi) coi, sum(put_oi) poi
                              from market.gamma_grid where snapshot_id = s.id group by strike) g),
          'pulse', (select jsonb_build_object(
                        'call_vol', coalesce(sum(call_vol),0), 'put_vol', coalesce(sum(put_vol),0),
                        'pc_vol_ratio', case when coalesce(sum(call_vol),0)>0 then round(sum(put_vol)::numeric/sum(call_vol),2) end,
                        'top', (select coalesce(jsonb_agg(jsonb_build_object('k',strike,'v',v) order by v desc),'[]'::jsonb)
                                  from (select strike, sum(coalesce(call_vol,0)+coalesce(put_vol,0)) v from market.gamma_grid where snapshot_id=s.id group by strike order by v desc limit 5) tv))
                      from market.gamma_grid where snapshot_id = s.id),
          'vector', case
              when s.regime='negative' then 'Dealers short gamma (amplifying) — moves tend to extend, not fade. Put wall $'||round(s.put_wall)||' is support; a break below accelerates. Call wall $'||round(s.call_wall)||' caps rallies.'
              when s.regime='positive' then 'Dealers long gamma (suppressing) — expect pinning/mean-reversion between the walls. Put wall $'||round(s.put_wall)||' and call wall $'||round(s.call_wall)||' act as magnets.'
              else 'Balanced dealer gamma — no strong pin or amplification signal; trade the walls ($'||round(s.put_wall)||'–$'||round(s.call_wall)||').' end
        ) as u,
        un.priority
        from market.chain_snapshots s
        join market.underlyings un on un.symbol = s.symbol
        where s.as_of = (select max(as_of) from market.chain_snapshots s2 where s2.symbol = s.symbol)
      ) z
    ),
    'as_of', (select max(as_of) from market.chain_snapshots),
    'coverage', jsonb_build_object('symbols', (select count(distinct symbol) from market.chain_snapshots),
                                   'watchlist', (select count(*) from market.underlyings where active)),
    'note', 'Dealer positioning is an ESTIMATE from the CBOE 15-minute-delayed chain (dealer long-call/short-put convention). Not real-time OPRA tape. Decision-support, not advice.'
  ), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$
;

-- ---- public.iris2_positioning_signals
CREATE OR REPLACE FUNCTION public.iris2_positioning_signals()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '8s'
AS $function$
declare t0 timestamptz := clock_timestamp();
begin
  perform brain.require_scope('investing');
  return iris2._ok(jsonb_build_object(
    'signals', (
      select coalesce(jsonb_agg(x order by (x->>'surfaced')::boolean desc, (x->>'conviction')::int desc, (x->>'priority')::int), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'symbol', s.symbol, 'name', un.name, 'priority', un.priority,
          'kind', s.kind, 'behavior', s.behavior, 'direction', s.direction,
          'conviction', s.conviction, 'band', s.conviction_band, 'novelty', s.novelty,
          'noise_prob', s.noise_prob, 'regime', s.regime, 'confirmations', s.confirmations,
          'surfaced', s.surfaced, 'status', s.status,
          'gates', jsonb_build_object('fresh', s.gate_fresh, 'multidim', s.gate_multidim,
                                      'verified', s.gate_verified, 'explained', s.gate_explained),
          'gate_detail', s.gate_detail, 'headline', s.headline, 'invalidation', s.invalidation,
          'factors', s.factors, 'evidence', s.evidence, 'as_of', s.as_of
        ) x, un.priority
        from market.signals s
        join market.underlyings un on un.symbol = s.symbol
        where s.status in ('active','watch')
      ) z
    ),
    'counts', (select jsonb_build_object(
        'surfaced', count(*) filter (where surfaced),
        'watch', count(*) filter (where status='watch'),
        'total', count(*)) from market.signals),
    'as_of', (select max(as_of) from market.signals),
    'note', 'Deterministic dealer-positioning signals from the CBOE 15-min-delayed chain. Every score is a fixed function of option structure — no model. Decision-support, not advice.'
  ), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$
;

-- ---- public.iris_inv_catalyst
CREATE OR REPLACE FUNCTION public.iris_inv_catalyst(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare r jsonb; n int := 0;
begin
  perform brain.check_app_token(p_token);
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    insert into inv.catalysts (kind, headline, detail, url, source, tickers, industries, score)
    values (coalesce(r->>'kind','news'), left(r->>'headline',400), r->>'detail', r->>'url',
            coalesce(r->>'source','unknown'),
            (select array_agg(upper(t)) from jsonb_array_elements_text(coalesce(r->'tickers','[]'::jsonb)) t),
            (select array_agg(t) from jsonb_array_elements_text(coalesce(r->'industries','[]'::jsonb)) t),
            (r->>'score')::numeric)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok',true,'rows',n);
end $function$
;

-- ---- public.iris_inv_catalyst_upsert
CREATE OR REPLACE FUNCTION public.iris_inv_catalyst_upsert(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare r jsonb; n int := 0; ins int := 0; upd int := 0; v_ins boolean;
  v_started timestamptz := clock_timestamp();
begin
  perform brain.check_app_token(p_token);
  begin
    for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
      insert into inv.catalysts (
        kind, headline, detail, url, source, tickers, score,
        cik, ticker, company, event_type, item_code, items, accession, filed_at, accepted_at, at)
      values (
        coalesce(r->>'kind','filing'),
        left(r->>'headline',400), r->>'detail', r->>'url',
        coalesce(r->>'source','SEC EDGAR full-text search'),
        case when nullif(r->>'ticker','') is not null then array[upper(r->>'ticker')] else null end,
        (r->>'score')::numeric,
        (r->>'cik')::int, upper(nullif(r->>'ticker','')), r->>'company',
        r->>'event_type', r->>'item_code',
        (select array_agg(t) from jsonb_array_elements_text(coalesce(r->'items','[]'::jsonb)) t),
        nullif(r->>'accession',''), (r->>'filed_at')::date, (r->>'accepted_at')::timestamptz,
        coalesce((r->>'accepted_at')::timestamptz, (r->>'filed_at')::timestamptz, now()))
      on conflict (accession, item_code) where accession is not null and item_code is not null
      do update set
        headline    = excluded.headline,
        detail      = excluded.detail,
        url         = excluded.url,
        tickers     = excluded.tickers,
        ticker      = excluded.ticker,
        company     = excluded.company,
        cik         = excluded.cik,
        items       = excluded.items,
        event_type  = excluded.event_type,
        score       = excluded.score,
        accepted_at = coalesce(excluded.accepted_at, inv.catalysts.accepted_at),
        at          = coalesce(excluded.accepted_at, inv.catalysts.accepted_at, inv.catalysts.at)
      returning (xmax = 0) into v_ins;
      if v_ins then ins := ins + 1; else upd := upd + 1; end if;
      n := n + 1;
    end loop;
  exception when others then
    -- record the failed run so the feed reads 'failing' instead of silently green, then re-raise
    begin perform iris.feed_report('catalysts', false, 0, sqlerrm, 'n8n:WGqH0xLUGDq2ZCkP', v_started,
      jsonb_build_object('rows_in', jsonb_array_length(coalesce(p_rows,'[]'::jsonb))), null);
    exception when others then null; end;
    raise;
  end;
  -- record the successful run (0 rows is fine: catalysts is zero_rows_ok)
  begin perform iris.feed_report('catalysts', true, n, null, 'n8n:WGqH0xLUGDq2ZCkP', v_started,
    jsonb_build_object('inserted', ins, 'updated', upd), null);
  exception when others then null; end;
  return jsonb_build_object('ok',true,'rows',n,'inserted',ins,'updated',upd);
end $function$
;

-- ---- public.iris_inv_catalysts
CREATE OR REPLACE FUNCTION public.iris_inv_catalysts(p_token text, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare v jsonb;
begin
  perform brain.check_app_token(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'at',c.at,'kind',c.kind,'headline',c.headline,
      'detail',c.detail,'url',c.url,'source',c.source,'tickers',c.tickers,'industries',c.industries,
      'score',c.score,'status',c.status) order by c.at desc),'[]'::jsonb) into v
  from (select * from inv.catalysts order by at desc limit greatest(1,p_limit)) c;
  return jsonb_build_object('catalysts', v, 'at', now());
end $function$
;

-- ---- public.iris_inv_ciks_needing_facts
CREATE OR REPLACE FUNCTION public.iris_inv_ciks_needing_facts(p_token text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'brain', 'extensions'
AS $function$
declare v jsonb;
begin
  perform brain.check_app_token(p_token);
  select jsonb_agg(cik order by cik) into v from (
    select distinct s.cik
    from inv.securities s
    left join inv.fundamentals f on f.cik = s.cik
    where s.is_active and s.kind='common' and s.excluded_reason is null
      and s.cik is not null and f.cik is null
    order by s.cik
    limit greatest(1, p_limit)
  ) q;
  return jsonb_build_object('ciks', coalesce(v,'[]'::jsonb), 'count', coalesce(jsonb_array_length(v),0));
end $function$
;

-- ---- public.iris_inv_earnings_actual
CREATE OR REPLACE FUNCTION public.iris_inv_earnings_actual(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare n int := 0;
begin
  perform brain.check_app_token(p_token);
  with src as (
    select r->>'accession' accession, (r->>'cik')::int cik, upper(nullif(r->>'ticker','')) ticker,
           (r->>'period_end')::date period_end,
           (r->>'eps_gaap')::numeric eps_gaap, (r->>'eps_non_gaap')::numeric eps_non_gaap,
           (r->>'revenue')::numeric revenue, coalesce(r->>'currency','USD') currency,
           r->>'exhibit_url' exhibit_url, r->>'extracted_by' extracted_by,
           (r->>'confidence')::numeric confidence
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) r
    where nullif(r->>'accession','') is not null
  ), u as (
    insert into inv.earnings_actuals (accession, cik, ticker, period_end, eps_gaap, eps_non_gaap,
                                      revenue, currency, exhibit_url, extracted_by, confidence, extracted_at)
    select accession, cik, ticker, period_end, eps_gaap, eps_non_gaap, revenue, currency,
           exhibit_url, extracted_by, confidence, now() from src
    on conflict (accession) do update set
      cik=excluded.cik, ticker=excluded.ticker, period_end=excluded.period_end,
      eps_gaap=excluded.eps_gaap, eps_non_gaap=excluded.eps_non_gaap, revenue=excluded.revenue,
      currency=excluded.currency, exhibit_url=excluded.exhibit_url,
      extracted_by=excluded.extracted_by, confidence=excluded.confidence, extracted_at=now()
    returning 1
  )
  select count(*) into n from u;
  return jsonb_build_object('ok', true, 'rows', n);
end $function$
;

-- ---- public.iris_inv_earnings_pending
CREATE OR REPLACE FUNCTION public.iris_inv_earnings_pending(p_token text, p_days integer DEFAULT 5, p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare v jsonb;
begin
  perform brain.check_app_token(p_token);
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v from (
    select c.accession, c.cik, c.ticker, c.company, c.filed_at, c.url
    from inv.catalysts c
    left join inv.earnings_actuals a on a.accession = c.accession
    where c.event_type = 'earnings'
      and a.accession is null
      and c.ticker is not null
      and c.filed_at >= current_date - p_days
    order by c.accepted_at desc nulls last
    limit greatest(1, p_limit)
  ) x;
  return jsonb_build_object('ok', true, 'rows', v, 'n', jsonb_array_length(v));
end $function$
;

-- ---- public.iris_inv_estimates
CREATE OR REPLACE FUNCTION public.iris_inv_estimates(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare n int := 0;
begin
  perform brain.check_app_token(p_token);
  with src as (
    select upper(r->>'ticker') ticker, (r->>'report_date')::date rd,
           (r->>'fiscal_date_ending')::date fde, (r->>'estimate_eps')::numeric est,
           coalesce(r->>'currency','USD') cur, nullif(r->>'time_of_day','') tod,
           coalesce(r->>'source','alphavantage:EARNINGS_CALENDAR') src
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) r
    where nullif(r->>'ticker','') is not null and nullif(r->>'report_date','') is not null
  ), u as (
    insert into inv.earnings_estimates (ticker, report_date, fiscal_date_ending, estimate_eps, currency, time_of_day, source, updated_at)
    select ticker, rd, fde, est, cur, tod, src, now() from src
    on conflict (ticker, report_date) do update set
      fiscal_date_ending = excluded.fiscal_date_ending,
      estimate_eps       = excluded.estimate_eps,
      currency           = excluded.currency,
      time_of_day        = excluded.time_of_day,
      source             = excluded.source,
      updated_at         = now()
    returning 1
  )
  select count(*) into n from u;
  return jsonb_build_object('ok',true,'rows',n);
end $function$
;

-- ---- public.iris_inv_facts
CREATE OR REPLACE FUNCTION public.iris_inv_facts(p_token text, p_cik integer, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare r jsonb; n int := 0;
begin
  perform brain.check_app_token(p_token);
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    insert into inv.facts (cik, concept, unit, start_d, end_d, val, form, filed, accn)
    values (p_cik, r->>'concept', r->>'unit', (r->>'start')::date, (r->>'end')::date,
            (r->>'val')::numeric, r->>'form', (r->>'filed')::date, r->>'accn')
    on conflict (cik, concept, unit, start_d, end_d) do update
      set val = excluded.val, form = excluded.form, filed = excluded.filed, accn = excluded.accn
      where excluded.filed >= inv.facts.filed;      -- newest filing wins: restatements
    n := n + 1;
  end loop;
  return jsonb_build_object('ok',true,'rows',n);
end $function$
;

-- ---- public.iris_inv_fundamentals
CREATE OR REPLACE FUNCTION public.iris_inv_fundamentals(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare r jsonb; n int := 0; skipped int := 0;
begin
  perform brain.check_app_token(p_token);
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    if not exists (select 1 from inv.securities s where s.cik = (r->>'cik')::int) then
      skipped := skipped + 1; continue;
    end if;
    insert into inv.fundamentals (cik, revenue_ttm, revenue_asof, revenue_basis, equity, equity_end,
        shares, shares_asof, shares_src, assets, liabilities, cash, debt, currency, note, computed_at,
        net_income_ttm, net_income_asof, net_income_basis)
    values ((r->>'cik')::int, (r->>'revenue_ttm')::numeric, (r->>'revenue_asof')::date,
        coalesce(r->>'revenue_basis','ttm'), (r->>'equity')::numeric, (r->>'equity_end')::date,
        (r->>'shares')::numeric, (r->>'shares_asof')::date, r->>'shares_src',
        (r->>'assets')::numeric, (r->>'liabilities')::numeric, (r->>'cash')::numeric,
        (r->>'debt')::numeric, coalesce(r->>'currency','USD'), r->>'note', now(),
        (r->>'net_income_ttm')::numeric, (r->>'net_income_asof')::date, r->>'net_income_basis')
    on conflict (cik) do update set revenue_ttm=excluded.revenue_ttm, revenue_asof=excluded.revenue_asof,
      revenue_basis=excluded.revenue_basis, equity=excluded.equity, equity_end=excluded.equity_end,
      shares=excluded.shares, shares_asof=excluded.shares_asof, shares_src=excluded.shares_src,
      assets=excluded.assets, liabilities=excluded.liabilities, cash=excluded.cash, debt=excluded.debt,
      currency=excluded.currency, note=excluded.note, computed_at=now(),
      net_income_ttm=excluded.net_income_ttm, net_income_asof=excluded.net_income_asof,
      net_income_basis=excluded.net_income_basis;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok',true,'rows',n,'skipped_unknown_cik',skipped);
end $function$
;

-- ---- public.iris_inv_macro
CREATE OR REPLACE FUNCTION public.iris_inv_macro(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare v jsonb;
begin
  perform brain.check_app_token(p_token);
  select coalesce(jsonb_agg(x order by x->>'series_id'),'[]'::jsonb) into v from (
    select jsonb_build_object('series_id', m.series_id, 'label', m.label, 'unit', m.unit,
      'latest', m.value, 'latest_date', m.d,
      'prior_year', (select value from inv.macro p where p.series_id=m.series_id
                     and p.d <= m.d - 365 and p.value is not null order by p.d desc limit 1),
      'history', (select jsonb_agg(jsonb_build_object('d',h.d,'v',h.value) order by h.d)
                  from (select d, value from inv.macro h where h.series_id=m.series_id
                        and h.value is not null and h.d > current_date - 800 order by d) h)) as x
    from (select distinct on (series_id) series_id, d, value, label, unit
          from inv.macro where value is not null order by series_id, d desc) m
  ) q;
  return jsonb_build_object('macro', v, 'at', now());
end $function$
;

-- ---- public.iris_inv_net_income
CREATE OR REPLACE FUNCTION public.iris_inv_net_income(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare n int := 0;
begin
  perform brain.check_app_token(p_token);
  with src as (
    select (r->>'cik')::int cik,
           (r->>'net_income_ttm')::numeric ni,
           (r->>'net_income_asof')::date asof,
           r->>'net_income_basis' basis
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) r
  ), u as (
    update inv.fundamentals f
       set net_income_ttm   = s.ni,
           net_income_asof  = s.asof,
           net_income_basis = coalesce(s.basis,'us-gaap:NetIncomeLoss')
      from src s
     where f.cik = s.cik
    returning 1
  )
  select count(*) into n from u;
  return jsonb_build_object('ok',true,'updated',n);
end $function$
;

-- ---- public.iris_inv_pressure
CREATE OR REPLACE FUNCTION public.iris_inv_pressure(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare v jsonb;
begin
  perform brain.check_app_token(p_token);
  select coalesce(jsonb_agg(x order by (x->>'yoy')::numeric desc nulls last),'[]'::jsonb) into v from (
    select jsonb_build_object(
      'series_id', l.series_id, 'input', coalesce(mp.input_name, l.label), 'label', l.label,
      'period', l.period, 'value', l.value, 'prior_year', py.value,
      'yoy', case when py.value > 0 then round((l.value - py.value)/py.value, 4) end,
      'direction', case when py.value is null then 'unknown'
                        when l.value > py.value * 1.02 then 'rising'
                        when l.value < py.value * 0.98 then 'falling' else 'flat' end,
      'rationale', mp.rationale,
      'beneficiaries', (select coalesce(jsonb_agg(jsonb_build_object('ticker',t.ticker,'name',t.name,'sic',t.sic)
                                order by t.rev desc nulls last),'[]'::jsonb)
                        from (select s.ticker, s.name, s.sic, f.revenue_ttm rev
                                from inv.securities s left join inv.fundamentals f on f.cik=s.cik
                               where s.is_active and s.kind='common' and s.sic = any(mp.beneficiary_sic)
                               order by f.revenue_ttm desc nulls last limit 8) t),
      'victims', (select coalesce(jsonb_agg(jsonb_build_object('ticker',t.ticker,'name',t.name,'sic',t.sic)
                           order by t.rev desc nulls last),'[]'::jsonb)
                  from (select s.ticker, s.name, s.sic, f.revenue_ttm rev
                          from inv.securities s left join inv.fundamentals f on f.cik=s.cik
                         where s.is_active and s.kind='common' and s.sic = any(mp.victim_sic)
                         order by f.revenue_ttm desc nulls last limit 8) t),
      'beneficiary_count', (select count(*) from inv.securities s where s.is_active and s.kind='common' and s.sic = any(mp.beneficiary_sic)),
      'victim_count',      (select count(*) from inv.securities s where s.is_active and s.kind='common' and s.sic = any(mp.victim_sic)),
      'history', (select jsonb_agg(jsonb_build_object('d',h.period,'v',h.value) order by h.period)
                  from inv.ppi h where h.series_id=l.series_id and h.period > current_date - 1200)
    ) as x
    from (select distinct on (series_id) series_id, period, value, label
          from inv.ppi order by series_id, period desc) l
    left join lateral (select value from inv.ppi p where p.series_id=l.series_id
                       and p.period <= l.period - interval '11 months' order by p.period desc limit 1) py on true
    left join inv.ppi_map mp on mp.series_id = l.series_id
  ) q;
  return jsonb_build_object('pressure', v, 'at', now(),
    'note','Only the year-on-year change is meaningful — PPI levels sit on different bases and must never be compared across series. Beneficiary and victim lists are the largest names by reported revenue in the mapped SIC codes; the mapping is curated and editable, not inferred.');
end $function$
;

-- ---- public.iris_inv_prices
CREATE OR REPLACE FUNCTION public.iris_inv_prices(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare r jsonb; n int := 0;
begin
  perform brain.check_app_token(p_token);
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    insert into inv.prices (ticker, d, close, volume, source)
    values (upper(r->>'ticker'), (r->>'d')::date, (r->>'close')::numeric,
            (r->>'volume')::bigint, coalesce(r->>'source','unknown'))
    on conflict (ticker, d) do update set close=excluded.close, volume=excluded.volume, source=excluded.source;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok',true,'rows',n);
end $function$
;

-- ---- public.iris_inv_prices_bulk
CREATE OR REPLACE FUNCTION public.iris_inv_prices_bulk(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare n int := 0;
begin
  perform brain.check_app_token(p_token);
  with src as (
    select upper(r->>'ticker') ticker, (r->>'d')::date d,
           (r->>'close')::numeric close, (r->>'volume')::bigint volume,
           coalesce(r->>'source','unknown') source
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) r
    where nullif(r->>'ticker','') is not null
      and nullif(r->>'d','') is not null
      and nullif(r->>'close','') is not null
  ), dedup as (
    select distinct on (ticker, d) ticker, d, close, volume, source
    from src order by ticker, d
  ), u as (
    insert into inv.prices (ticker, d, close, volume, source)
    select ticker, d, close, volume, source from dedup
    on conflict (ticker, d) do update set
      close = excluded.close, volume = excluded.volume, source = excluded.source
    returning 1
  )
  select count(*) into n from u;
  return jsonb_build_object('ok', true, 'rows', n);
end $function$
;

-- ---- public.iris_inv_screen
CREATE OR REPLACE FUNCTION public.iris_inv_screen(p_token text, p_max_ps numeric DEFAULT 3.0, p_max_pb numeric DEFAULT 1.0, p_limit integer DEFAULT 60, p_max_pe numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare v jsonb; cov jsonb; blocked text;
begin
  perform brain.check_app_token(p_token);
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into v
    from inv.screen_value(p_max_ps => p_max_ps, p_max_pb => p_max_pb,
                          p_max_pe => p_max_pe, p_limit => p_limit) s;
  select jsonb_build_object(
    'securities',        (select count(*) from inv.securities where is_active and kind='common'),
    'with_fundamentals', (select count(*) from inv.fundamentals),
    'with_net_income',   (select count(*) from inv.fundamentals where net_income_ttm is not null),
    'ratio_ready',       (select count(*) from inv.fundamentals
                          where coalesce(equity,0) > 0 and coalesce(revenue_ttm,0) > 0
                            and coalesce(shares,0) > 100000),
    'with_price',        (select count(distinct ticker) from inv.prices),
    'screenable',        (select count(*) from inv.securities s
                            join inv.fundamentals f on f.cik = s.cik
                           where s.is_active and s.kind='common'
                             and exists (select 1 from inv.prices p where p.ticker = s.ticker)),
    'newest_price',      (select max(d) from inv.prices),
    'newest_macro',      (select max(d) from inv.macro),
    'newest_ppi',        (select max(period) from inv.ppi)) into cov;

  if (cov->>'with_price')::int = 0 then
    blocked :=
      'No rows in inv.prices, so every multiple is uncomputable. The denominators are ready: '
      ||(cov->>'ratio_ready')||' companies already have positive book equity, positive revenue and a '
      ||'sane share count from SEC EDGAR, and '||(cov->>'with_net_income')||' carry net income for P/E. '
      ||'Price is the single missing input. No keyless bulk US price source remains: stooq serves a '
      ||'JavaScript proof-of-work challenge and api.nasdaq.com is robots.txt "Disallow: /" — both are '
      ||'off-limits and will not be used. The intended feed is Massive (ex-Polygon.io) grouped daily '
      ||'aggregates — one request covers the whole US market — read from the n8n variable PRICE_API_KEY. '
      ||'UNVERIFIED: whether grouped-daily is ungated on Massive''s free "Stocks Basic" tier. That is the '
      ||'first thing to test with a real key; documented fallback is Stocks Starter at $29/month.';
  end if;

  return jsonb_build_object(
    'rule', 'P/S < '||p_max_ps||' and P/B < '||p_max_pb
            ||case when p_max_pe is null then '' else ' and P/E < '||p_max_pe end,
    'results', v, 'n', jsonb_array_length(v),
    'coverage', cov, 'blocked_by', blocked, 'at', now());
end $function$
;

-- ---- public.iris_inv_security
CREATE OR REPLACE FUNCTION public.iris_inv_security(p_token text, p_ticker text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare v jsonb; t text := upper(p_ticker);
begin
  perform brain.check_app_token(p_token);
  select jsonb_build_object(
    'security', (select to_jsonb(s) from inv.securities s where s.ticker=t limit 1),
    'fundamentals', (select to_jsonb(f) from inv.securities s join inv.fundamentals f on f.cik=s.cik where s.ticker=t limit 1),
    'prices', (select coalesce(jsonb_agg(jsonb_build_object('d',p.d,'c',p.close) order by p.d),'[]'::jsonb)
               from inv.prices p where p.ticker=t and p.d > current_date - 800),
    'revenue_history', (select coalesce(jsonb_agg(jsonb_build_object('end',fa.end_d,'val',fa.val) order by fa.end_d),'[]'::jsonb)
               from inv.securities s join inv.facts fa on fa.cik=s.cik
               where s.ticker=t and fa.concept in ('Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet','RevenuesNetOfInterestExpense')
                 and fa.end_d - fa.start_d > 330),
    'equity_history', (select coalesce(jsonb_agg(jsonb_build_object('end',fa.end_d,'val',fa.val) order by fa.end_d),'[]'::jsonb)
               from inv.securities s join inv.facts fa on fa.cik=s.cik
               where s.ticker=t and fa.concept in ('StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest')
                 and fa.start_d is null),
    'catalysts', (select coalesce(jsonb_agg(jsonb_build_object('at',c.at,'kind',c.kind,'headline',c.headline,
                    'url',c.url,'source',c.source) order by c.at desc),'[]'::jsonb)
                  from inv.catalysts c where t = any(c.tickers) limit 25),
    'theses', (select coalesce(jsonb_agg(to_jsonb(th) order by th.created_at desc),'[]'::jsonb)
               from inv.theses th where th.ticker=t)
  ) into v;
  return v;
end $function$
;

-- ---- public.iris_inv_series
CREATE OR REPLACE FUNCTION public.iris_inv_series(p_token text, p_kind text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare r jsonb; n int := 0;
begin
  perform brain.check_app_token(p_token);
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    if p_kind = 'macro' then
      insert into inv.macro (series_id, d, value, label, unit)
      values (r->>'series_id', (r->>'d')::date, (r->>'value')::numeric, r->>'label', r->>'unit')
      on conflict (series_id, d) do update set value=excluded.value,
        label=coalesce(excluded.label, inv.macro.label);
    else
      insert into inv.ppi (series_id, period, value, label, industry)
      values (r->>'series_id', (r->>'period')::date, (r->>'value')::numeric, r->>'label', r->>'industry')
      on conflict (series_id, period) do update set value=excluded.value,
        label=coalesce(excluded.label, inv.ppi.label);
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok',true,'rows',n);
end $function$
;

-- ---- public.iris_inv_sparks
CREATE OR REPLACE FUNCTION public.iris_inv_sparks(p_token text, p_tickers text[], p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'brain', 'extensions'
AS $function$
declare v jsonb; begin
  perform brain.check_app_token(p_token);
  select jsonb_object_agg(ticker, jsonb_build_object('closes', closes, 'first', first_c, 'last', last_c, 'n', n,
           'chg_pct', case when first_c > 0 then round((last_c/first_c - 1)*100, 2) end,
           'hi', hi, 'lo', lo, 'from', d0, 'to', d1)) into v
  from (
    select ticker, jsonb_agg(close order by d) closes,
           (array_agg(close order by d))[1] first_c, (array_agg(close order by d desc))[1] last_c,
           count(*) n, max(close) hi, min(close) lo, min(d) d0, max(d) d1
      from inv.prices
     where ticker = any(select upper(t) from unnest(coalesce(p_tickers,'{}'::text[])) t)
       and d >= current_date - greatest(7, coalesce(p_days,90))
     group by ticker) q;
  return jsonb_build_object('sparks', coalesce(v,'{}'::jsonb), 'days', p_days, 'at', now());
end $function$
;

-- ---- public.iris_inv_tickers
CREATE OR REPLACE FUNCTION public.iris_inv_tickers(p_token text, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0, p_stale_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare v jsonb; tot int;
begin
  perform brain.check_app_token(p_token);
  select count(*) into tot from inv.securities s
   where s.is_active and s.kind='common'
     and (not p_stale_only or not exists (
          select 1 from inv.prices p where p.ticker=s.ticker and p.d > current_date - 4));
  select coalesce(jsonb_agg(jsonb_build_object('cik',x.cik,'ticker',x.ticker) order by x.ticker),'[]'::jsonb)
    into v from (
      select s.cik, s.ticker from inv.securities s
       where s.is_active and s.kind='common'
         and (not p_stale_only or not exists (
              select 1 from inv.prices p where p.ticker=s.ticker and p.d > current_date - 4))
       order by s.ticker offset greatest(0,p_offset) limit greatest(1,least(2000,p_limit))
    ) x;
  return jsonb_build_object('tickers', v, 'total', tot, 'limit', p_limit, 'offset', p_offset,
                            'next_offset', p_offset + jsonb_array_length(v));
end $function$
;

-- ---- public.iris_inv_upsert_securities
CREATE OR REPLACE FUNCTION public.iris_inv_upsert_securities(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
AS $function$
declare r jsonb; n int := 0;
begin
  perform brain.check_app_token(p_token);
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    insert into inv.securities (cik, ticker, exchange, name, sic, sic_desc, kind, is_active, excluded_reason)
    values ((r->>'cik')::int, upper(r->>'ticker'), r->>'exchange', r->>'name', r->>'sic', r->>'sic_desc',
            coalesce(r->>'kind','common'), coalesce((r->>'is_active')::boolean,true), r->>'excluded_reason')
    on conflict (cik) do update set ticker=excluded.ticker, exchange=excluded.exchange,
      name=coalesce(excluded.name, inv.securities.name),
      sic=coalesce(excluded.sic, inv.securities.sic),
      sic_desc=coalesce(excluded.sic_desc, inv.securities.sic_desc),
      kind=excluded.kind, is_active=excluded.is_active,
      excluded_reason=excluded.excluded_reason, updated_at=now();
    n := n + 1;
  end loop;
  return jsonb_build_object('ok',true,'upserted',n);
end $function$
;

-- ---- public.iris_positioning_ingest
CREATE OR REPLACE FUNCTION public.iris_positioning_ingest(p_token text, p_symbol text, p_as_of timestamp with time zone, p_spot numeric, p_cells jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '90s'
AS $function$ begin return market.ingest_chain(p_token, p_symbol, p_as_of, p_spot, p_cells); end $function$
;

-- ---- public.iris_positioning_ingest_sr
CREATE OR REPLACE FUNCTION public.iris_positioning_ingest_sr(p_symbol text, p_as_of timestamp with time zone, p_spot numeric, p_cells jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '90s'
AS $function$ begin return market._ingest_chain(p_symbol, p_as_of, p_spot, p_cells); end $function$
;

-- ---- public.iris_positioning_refresh
CREATE OR REPLACE FUNCTION public.iris_positioning_refresh(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
declare t0 timestamptz := clock_timestamp(); n int; syms int;
begin
  perform brain.check_app_token(p_token);
  n := market.refresh_signals();
  select count(distinct symbol) into syms from market.chain_snapshots
    where as_of >= now() - interval '4 hours';
  perform iris.feed_report('positioning', syms > 0, syms, null, 'refresh_signals', t0,
    jsonb_build_object('signals', n, 'symbols_fresh', syms), null);
  return jsonb_build_object('ok', true, 'signals', n, 'symbols_fresh', syms);
exception when others then
  perform iris.feed_report('positioning', false, 0, sqlerrm, 'refresh_signals', t0, null, null);
  raise;
end $function$
;

-- ---- public.iris_price_backfill_tickers
CREATE OR REPLACE FUNCTION public.iris_price_backfill_tickers(p_token text, p_limit integer DEFAULT 300, p_min_rows integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'brain', 'extensions'
AS $function$
declare v jsonb; v_rem int; begin
  perform brain.check_app_token(p_token);
  with universe as (
    select s.ticker from inv.securities s join inv.fundamentals f on f.cik=s.cik
    where s.is_active and s.kind='common' and s.excluded_reason is null
      and f.currency='USD' and coalesce(f.shares,0)>100000 and coalesce(f.equity,0)>0
      and coalesce(f.revenue_ttm,0)>=50000000 and coalesce(f.net_income_ttm,0)>0
      and (f.assets is null or coalesce(f.liabilities,0)/nullif(f.assets,0)<0.85)
  ), hist as (select ticker, count(*) n from inv.prices group by 1),
  need as (select u.ticker, coalesce(h.n,0) n from universe u left join hist h on h.ticker=u.ticker where coalesce(h.n,0) < p_min_rows)
  select jsonb_agg(ticker order by n, ticker), count(*) into v, v_rem from (select * from need order by n, ticker limit greatest(1,p_limit)) q;
  return jsonb_build_object('tickers', coalesce(v,'[]'::jsonb), 'count', coalesce(jsonb_array_length(v),0),
    'remaining', (select count(*) from (select u.ticker from (select s.ticker from inv.securities s join inv.fundamentals f on f.cik=s.cik
        where s.is_active and s.kind='common' and s.excluded_reason is null and f.currency='USD' and coalesce(f.shares,0)>100000 and coalesce(f.equity,0)>0
          and coalesce(f.revenue_ttm,0)>=50000000 and coalesce(f.net_income_ttm,0)>0 and (f.assets is null or coalesce(f.liabilities,0)/nullif(f.assets,0)<0.85)) u
        left join (select ticker, count(*) n from inv.prices group by 1) h on h.ticker=u.ticker where coalesce(h.n,0) < p_min_rows) z));
end $function$
;

-- ---- public.iris_price_tickers
CREATE OR REPLACE FUNCTION public.iris_price_tickers(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'brain', 'extensions'
AS $function$
declare v jsonb;
begin
  perform brain.check_app_token(p_token);
  select jsonb_agg(ticker order by ticker) into v
  from inv.securities s join inv.fundamentals f on f.cik=s.cik
  where s.is_active and s.kind='common' and s.excluded_reason is null
    and f.currency='USD' and coalesce(f.shares,0)>100000 and coalesce(f.equity,0)>0
    and coalesce(f.revenue_ttm,0)>=50000000 and coalesce(f.net_income_ttm,0)>0
    and (f.assets is null or coalesce(f.liabilities,0)/nullif(f.assets,0)<0.85);
  return jsonb_build_object('tickers', coalesce(v,'[]'::jsonb), 'count', coalesce(jsonb_array_length(v),0));
end $function$
;

-- ---- public.iris_prices_upsert
CREATE OR REPLACE FUNCTION public.iris_prices_upsert(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'brain', 'extensions'
AS $function$
declare n int;
begin
  perform brain.check_app_token(p_token);
  insert into inv.prices (ticker, d, close, volume, source)
  select upper(r->>'ticker'), (r->>'d')::date, (r->>'close')::numeric,
         nullif(r->>'volume','')::bigint, coalesce(r->>'source','stooq')
  from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) r
  where r->>'ticker' is not null and r->>'close' is not null
    and (r->>'close') ~ '^[0-9.]+$' and (r->>'close')::numeric > 0
  on conflict (ticker,d) do update set close=excluded.close, volume=excluded.volume, source=excluded.source;
  get diagnostics n = row_count;
  return jsonb_build_object('upserted', n);
end $function$
;


