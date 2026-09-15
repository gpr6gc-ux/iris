-- IRIS Investing — Phase 1 · separate effective times on options-chain snapshots
--
-- Why: chain_snapshots.as_of was the ingest wall-clock. The CBOE payload carries its own quote timestamp (15-minute
-- delayed), open interest is as of the prior session, and the Greeks are the vendor's. Each of these now has its
-- own column; as_of becomes "effective time" = provider timestamp when known, else receipt time (and the row says so).
-- Existing rows are backfilled with received_at = as_of and source_as_of = null (unknown, not invented).
--
-- Rollback (bottom of file).

alter table market.chain_snapshots
  add column if not exists source_as_of     timestamptz,
  add column if not exists received_at      timestamptz,
  add column if not exists oi_business_date date,
  add column if not exists spot_as_of       timestamptz,
  add column if not exists greeks_source    text;

comment on column market.chain_snapshots.as_of is 'Effective time of the snapshot: source_as_of when the provider timestamp was recorded, otherwise received_at.';
comment on column market.chain_snapshots.source_as_of is 'Provider quote timestamp (CBOE delayed_quotes "timestamp", America/New_York). NULL = not recorded by the ingest at the time.';
comment on column market.chain_snapshots.received_at is 'When the ingest received the payload (wall clock).';
comment on column market.chain_snapshots.oi_business_date is 'Business date of the open-interest figures: CBOE publishes OI once per morning for the prior session, so a snapshot taken during or after session D carries OI as of D-1.';
comment on column market.chain_snapshots.spot_as_of is 'Time the underlying spot was observed. Equals source_as_of for CBOE (delayed quote); NULL when unknown.';
comment on column market.chain_snapshots.greeks_source is 'Who computed the Greeks in gamma_grid (vendor model, unspecified for cboe:delayed_quotes).';

update market.chain_snapshots
   set received_at = coalesce(received_at, as_of),
       oi_business_date = coalesce(oi_business_date, market.prior_session((as_of at time zone 'America/New_York')::date)),
       greeks_source = coalesce(greeks_source, 'cboe:delayed_quotes')
 where received_at is null or oi_business_date is null or greeks_source is null;

-- The private ingest gains two optional parameters. The old signatures are dropped first: keeping both would make a
-- 4-argument call ambiguous ("function is not unique"). Callers with the old argument list resolve to the defaults.
drop function if exists market._ingest_chain(text, timestamp with time zone, numeric, jsonb);
drop function if exists market.ingest_chain(text, text, timestamp with time zone, numeric, jsonb);
drop function if exists public.iris_positioning_ingest(text, text, timestamp with time zone, numeric, jsonb);

create or replace function market._ingest_chain(p_symbol text, p_as_of timestamp with time zone, p_spot numeric, p_cells jsonb,
                                                p_source_as_of timestamp with time zone default null,
                                                p_received_at timestamp with time zone default now())
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'pg_temp'
 set statement_timeout to '90s'
as $function$
declare
  v_snap uuid; v_net numeric; v_zg numeric; v_cw numeric; v_pw numeric; v_gross numeric;
  v_regime text; v_coi bigint; v_poi bigint; v_contracts int; v_expiries int; v_written int; t0 timestamptz := clock_timestamp();
  v_eff timestamptz := coalesce(p_source_as_of, p_as_of, p_received_at);
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
         total_call_oi, total_put_oi, put_call_oi_ratio, contracts, expiries, meta,
         source_as_of, received_at, oi_business_date, spot_as_of, greeks_source)
  values (p_symbol, v_eff, p_spot, v_net, v_zg, v_cw, v_pw, v_regime,
         v_coi, v_poi, case when v_coi>0 then round(v_poi::numeric/v_coi,3) end, v_contracts, v_expiries,
         jsonb_build_object('gross_gex', v_gross, 'gex_units', 'USD hedge change per 1% underlying move; dealers assumed long calls / short puts'),
         p_source_as_of, coalesce(p_received_at, now()),
         market.prior_session((v_eff at time zone 'America/New_York')::date),
         p_source_as_of, 'cboe:delayed_quotes')
  on conflict (symbol, as_of) do nothing
  returning id into v_snap;

  if v_snap is null then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('symbol', p_symbol, 'as_of', v_eff, 'deduped', true),
                              'meta', jsonb_build_object('took_ms', round(extract(epoch from clock_timestamp()-t0)*1000)));
  end if;

  insert into market.gamma_grid (snapshot_id, symbol, as_of, expiry, strike, call_oi, put_oi, call_gamma, put_gamma, call_vol, put_vol, dealer_gex)
  select v_snap, p_symbol, v_eff, (c->>'e')::date, (c->>'k')::numeric,
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
              jsonb_build_object('symbol', p_symbol, 'net_gex', v_net, 'regime', v_regime, 'source_as_of', p_source_as_of), null);
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'snapshot_id', v_snap, 'symbol', p_symbol, 'as_of', v_eff, 'source_as_of', p_source_as_of, 'spot', p_spot,
      'net_gex', v_net, 'regime', v_regime,
      'zero_gamma', v_zg, 'call_wall', v_cw, 'put_wall', v_pw, 'cells', v_written, 'expiries', v_expiries),
    'meta', jsonb_build_object('took_ms', round(extract(epoch from clock_timestamp()-t0)*1000)));
end $function$;

-- Token-gated wrapper (n8n) and the schema-level wrapper gain the same optional parameters. The 90 s statement budget
-- must sit on the OUTERMOST function: the API role's default timeout is armed at statement start.
create or replace function market.ingest_chain(p_token text, p_symbol text, p_as_of timestamp with time zone, p_spot numeric, p_cells jsonb,
                                               p_source_as_of timestamp with time zone default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'pg_temp'
 set statement_timeout to '90s'
as $function$
begin
  perform brain.check_app_token(p_token);
  return market._ingest_chain(p_symbol, p_as_of, p_spot, p_cells, p_source_as_of, now());
end $function$;

create or replace function public.iris_positioning_ingest(p_token text, p_symbol text, p_as_of timestamp with time zone, p_spot numeric, p_cells jsonb,
                                                          p_source_as_of timestamp with time zone default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'pg_temp'
 set statement_timeout to '90s'
as $function$
begin
  perform brain.check_app_token(p_token);
  return market._ingest_chain(p_symbol, p_as_of, p_spot, p_cells, p_source_as_of, now());
end $function$;

-- Grants exactly as before: the private helper is owner-only; the worker-lane wrapper is callable through PostgREST.
revoke execute on function market._ingest_chain(text,timestamptz,numeric,jsonb,timestamptz,timestamptz) from public;
revoke execute on function market.ingest_chain(text,text,timestamptz,numeric,jsonb,timestamptz) from public;
revoke execute on function public.iris_positioning_ingest(text,text,timestamptz,numeric,jsonb,timestamptz) from public;
do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.iris_positioning_ingest(text,text,timestamptz,numeric,jsonb,timestamptz) to anon, authenticated, service_role;
  end if;  -- local Postgres has no Supabase roles
end $g$;

-- Rollback:
--   restore market._ingest_chain / market.ingest_chain / public.iris_positioning_ingest from functions_investing.sql
--   (the 4/5-argument versions), then:
--   drop function public.iris_positioning_ingest(text,text,timestamptz,numeric,jsonb,timestamptz);
--   drop function market.ingest_chain(text,text,timestamptz,numeric,jsonb,timestamptz);
--   drop function market._ingest_chain(text,timestamptz,numeric,jsonb,timestamptz,timestamptz);
--   alter table market.chain_snapshots drop column source_as_of, drop column received_at, drop column oi_business_date,
--     drop column spot_as_of, drop column greeks_source;
