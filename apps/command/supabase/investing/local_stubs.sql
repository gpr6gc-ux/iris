-- IRIS investing: local stand-ins for the parts of the platform that live outside this repo.
-- Load AFTER schema_investing.sql and BEFORE functions_investing.sql.
--
-- The exported functions call five things that belong to the wider IRIS brain (auth, audit, feed health,
-- response envelopes). On a laptop Postgres those objects do not exist, so this file provides the smallest
-- honest version of each. None of this is deployed to the real project; the real gates are strict.

create schema if not exists brain;
create schema if not exists iris2;
create schema if not exists iris;
create schema if not exists ops;

-- ---- Worker-lane gate. Real version: hashed, per-role, revocable tokens (brain.app_tokens_v2).
-- Locally any call must present the token below; everything else is refused exactly like production (42501).
create or replace function brain.check_app_token(p_token text) returns void
language plpgsql as $$
begin
  if p_token is distinct from 'local-dev-token' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- ---- Owner/member gate. Real version: JWT email must be an owner, or an invited member carrying the scope.
-- Locally there is no JWT, so every caller is treated as the owner.
create or replace function brain.require_scope(p_scope text) returns void
language sql as $$ select null::void; $$;

create or replace function brain.require_owner() returns void
language sql as $$ select null::void; $$;

-- ---- Audit log. Real version writes ops.audit_log; locally it just returns an id.
create or replace function ops.audit(p_action text, p_object_type text, p_object_id text,
  p_before jsonb default null, p_after jsonb default null, p_actor_kind text default 'system', p_actor_id text default null)
returns bigint language sql as $$ select 0::bigint; $$;

-- ---- Feed health. Real version: iris.feed_health / iris.feed_runs with a status computer; the Command Center
-- reads the ops.feed_health view. Locally the view is an empty table with the same columns.
create table if not exists ops.feed_health (
  feed text primary key, source text, expected integer, last_at timestamptz, age_s bigint, state text, note text,
  domain text, writer text, evidence text, last_attempt_at timestamptz, last_error text,
  runs_24h_ok integer, runs_24h_failed integer, materiality text[]
);

create or replace function iris.feed_report(p_feed text, p_ok boolean, p_rows integer default null, p_error text default null,
  p_source_ref text default null, p_started_at timestamptz default null, p_meta jsonb default '{}'::jsonb, p_cost_usd numeric default null)
returns jsonb language sql as $$
  select jsonb_build_object('ok', true, 'feed', p_feed, 'status', case when p_ok then 'ok' else 'failing' end, 'local', true);
$$;

-- ---- Response envelope: every owner-lane function returns {ok, data, meta} or {ok:false, error:{code,message}, meta}.
-- These four are verbatim copies of production.
create or replace function iris2._meta(t0 timestamptz) returns jsonb
language sql stable set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'as_of', now(),
    'took_ms', greatest(0, round(extract(epoch from (clock_timestamp() - coalesce(t0, clock_timestamp()))) * 1000))::int,
    'version', '2.0');
$$;

create or replace function iris2._ok(data jsonb, t0 timestamptz) returns jsonb
language sql stable set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
  select jsonb_build_object('ok', true, 'data', coalesce(data, '{}'::jsonb), 'meta', iris2._meta(t0));
$$;

create or replace function iris2._err(code text, message text, t0 timestamptz) returns jsonb
language sql stable set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
  select jsonb_build_object('ok', false,
    'error', jsonb_build_object(
      'code', case when code in ('forbidden','not_found','invalid','conflict','timeout','internal') then code else 'internal' end,
      'message', left(coalesce(message, 'error'), 1000)),
    'meta', iris2._meta(t0));
$$;

create or replace function iris2._sqlstate_code(p_sqlstate text) returns text
language sql immutable set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
  select case
    when p_sqlstate = '42501' then 'forbidden'
    when p_sqlstate = '57014' then 'timeout'
    when p_sqlstate in ('P0002', '02000') then 'not_found'
    when p_sqlstate in ('23505', '40001', '40P01', '55P03', '55000') then 'conflict'
    when p_sqlstate like '22%' or p_sqlstate like '23%' or p_sqlstate = 'P0001' then 'invalid'
    else 'internal' end;
$$;

-- ---- Two private helpers the owner lane composes (verbatim copies of production).
create or replace function iris2._inv_screen(p_max_ps numeric, p_max_pb numeric, p_max_pe numeric, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $function$
declare v jsonb; cov jsonb; blocked text; mps numeric := coalesce(p_max_ps, 3.0); mpb numeric := coalesce(p_max_pb, 1.0); lim int := greatest(1, least(coalesce(p_limit, 60), 200));
begin
  with base as (
    select s.ticker, s.name, s.cik, s.exchange, s.sic_desc, x.close as price, x.d as price_date,
           f.revenue_ttm, f.equity, f.net_income_ttm, f.shares, f.revenue_asof, f.equity_end, f.net_income_asof, f.revenue_basis, f.assets, f.liabilities, f.cash,
           x.close * f.shares as market_cap
      from inv.securities s
      join inv.fundamentals f on f.cik = s.cik
      cross join lateral (select p.close, p.d from inv.prices p where p.ticker = s.ticker order by p.d desc limit 1) x
     where s.is_active and s.kind = 'common' and s.excluded_reason is null and f.currency = 'USD'
       and coalesce(f.shares, 0) > 100000 and coalesce(f.equity, 0) > 0 and coalesce(f.revenue_ttm, 0) > 0
       and (f.net_income_ttm is null or f.net_income_ttm <= f.revenue_ttm)
       and f.revenue_ttm >= 50000000 and coalesce(f.net_income_ttm, 0) > 0
       and (f.assets is null or coalesce(f.liabilities, 0) / nullif(f.assets, 0) < 0.85)
       and f.revenue_asof > current_date - 400 and f.equity_end > current_date - 200),
  m as (
    select b.*, round(market_cap / nullif(revenue_ttm, 0), 4) as ps, round(market_cap / nullif(equity, 0), 4) as pb,
           case when coalesce(net_income_ttm, 0) > 0 then round(market_cap / net_income_ttm, 4) end as pe,
           round(coalesce(liabilities, 0) / nullif(assets, 0), 4) as leverage, round(coalesce(cash, 0) / nullif(market_cap, 0), 4) as cash_to_cap
      from base b),
  r as (
    select ticker, name, cik, exchange, sic_desc, price, price_date, round(market_cap, 0) market_cap, ps, pb, pe, revenue_ttm, equity, net_income_ttm, shares,
           revenue_asof, equity_end, net_income_asof, revenue_basis, leverage, cash_to_cap,
           round(least(100, greatest(0, 40 * greatest(0, (mps - ps) / nullif(mps, 0)) + 40 * greatest(0, (mpb - pb) / nullif(mpb, 0))
                 - 20 * greatest(0, coalesce(leverage, 0.5) - 0.6) / 0.4 + 20 * least(1, coalesce(cash_to_cap, 0)))), 2) as score
      from m
     where ps < mps and pb < mpb and (p_max_pe is null or (pe is not null and pe < p_max_pe))
     order by score desc, pb asc limit lim)
  select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc, r.pb asc), '[]'::jsonb) into v from r;

  select jsonb_build_object(
    'securities', (select count(*) from inv.securities where is_active and kind = 'common'),
    'with_fundamentals', (select count(*) from inv.fundamentals),
    'with_net_income', (select count(*) from inv.fundamentals where net_income_ttm is not null),
    'ratio_ready', (select count(*) from inv.fundamentals where coalesce(equity, 0) > 0 and coalesce(revenue_ttm, 0) > 0 and coalesce(shares, 0) > 100000),
    'with_price', (select count(distinct ticker) from inv.prices),
    'screenable', (select count(*) from inv.securities s join inv.fundamentals f on f.cik = s.cik where s.is_active and s.kind = 'common' and exists (select 1 from inv.prices p where p.ticker = s.ticker)),
    'newest_price', (select max(d) from inv.prices), 'newest_macro', (select max(d) from inv.macro), 'newest_ppi', (select max(period) from inv.ppi)) into cov;
  if (cov->>'with_price')::int = 0 then blocked := 'No rows in inv.prices, so every multiple is uncomputable. Price is the single missing input.'; end if;
  return jsonb_build_object('rule', 'P/S < ' || mps || ' and P/B < ' || mpb || case when p_max_pe is null then '' else ' and P/E < ' || p_max_pe end,
    'params', jsonb_build_object('max_ps', mps, 'max_pb', mpb, 'max_pe', p_max_pe, 'limit', lim),
    'results', v, 'n', jsonb_array_length(v), 'coverage', cov, 'blocked_by', blocked,
    'rules', 'USD common stock, shares > 100k, positive book equity, revenue >= $50M, profitable TTM, liabilities/assets < 0.85, revenue filed < 400 days, equity < 200 days (same floor as inv.screen_value)');
end $function$;

create or replace function iris2._markets() returns jsonb
language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $function$
declare v_macro jsonb; v_pressure jsonb; v_cat jsonb; v_screen jsonb; v_sparks jsonb; prm jsonb; tick text[];
begin
  select coalesce(jsonb_agg(x order by x->>'series_id'), '[]'::jsonb) into v_macro from (
    select jsonb_build_object('series_id', m.series_id, 'label', m.label, 'unit', m.unit, 'latest', m.value, 'latest_date', m.d,
      'prior_year', (select value from inv.macro p where p.series_id = m.series_id and p.d <= m.d - 365 and p.value is not null order by p.d desc limit 1),
      'history', (select jsonb_agg(jsonb_build_object('d', h.d, 'v', h.value) order by h.d) from (select d, value from inv.macro h where h.series_id = m.series_id and h.value is not null and h.d > current_date - 800 order by d) h)) as x
    from (select distinct on (series_id) series_id, d, value, label, unit from inv.macro where value is not null order by series_id, d desc) m) q;

  select coalesce(jsonb_agg(x order by (x->>'yoy')::numeric desc nulls last), '[]'::jsonb) into v_pressure from (
    select jsonb_build_object('series_id', l.series_id, 'input', coalesce(mp.input_name, l.label), 'label', l.label, 'period', l.period, 'value', l.value, 'prior_year', py.value,
      'yoy', case when py.value > 0 then round((l.value - py.value) / py.value, 4) end,
      'direction', case when py.value is null then 'unknown' when l.value > py.value * 1.02 then 'rising' when l.value < py.value * 0.98 then 'falling' else 'flat' end,
      'rationale', mp.rationale,
      'beneficiaries', (select coalesce(jsonb_agg(jsonb_build_object('ticker', t.ticker, 'name', t.name, 'sic', t.sic) order by t.rev desc nulls last), '[]'::jsonb)
                        from (select s.ticker, s.name, s.sic, f.revenue_ttm rev from inv.securities s left join inv.fundamentals f on f.cik = s.cik
                               where s.is_active and s.kind = 'common' and s.sic = any(mp.beneficiary_sic) order by f.revenue_ttm desc nulls last limit 8) t),
      'victims', (select coalesce(jsonb_agg(jsonb_build_object('ticker', t.ticker, 'name', t.name, 'sic', t.sic) order by t.rev desc nulls last), '[]'::jsonb)
                  from (select s.ticker, s.name, s.sic, f.revenue_ttm rev from inv.securities s left join inv.fundamentals f on f.cik = s.cik
                         where s.is_active and s.kind = 'common' and s.sic = any(mp.victim_sic) order by f.revenue_ttm desc nulls last limit 8) t),
      'beneficiary_count', (select count(*) from inv.securities s where s.is_active and s.kind = 'common' and s.sic = any(mp.beneficiary_sic)),
      'victim_count', (select count(*) from inv.securities s where s.is_active and s.kind = 'common' and s.sic = any(mp.victim_sic)),
      'history', (select jsonb_agg(jsonb_build_object('d', h.period, 'v', h.value) order by h.period) from inv.ppi h where h.series_id = l.series_id and h.period > current_date - 1200)) as x
    from (select distinct on (series_id) series_id, period, value, label from inv.ppi order by series_id, period desc) l
    left join lateral (select value from inv.ppi p where p.series_id = l.series_id and p.period <= l.period - interval '11 months' order by p.period desc limit 1) py on true
    left join inv.ppi_map mp on mp.series_id = l.series_id) q;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'at', c.at, 'kind', c.kind, 'headline', c.headline, 'detail', c.detail, 'url', c.url, 'source', c.source,
           'tickers', c.tickers, 'industries', c.industries, 'score', c.score, 'status', c.status, 'event_type', c.event_type, 'item_code', c.item_code, 'company', c.company) order by c.at desc), '[]'::jsonb) into v_cat
  from (select * from inv.catalysts where at > now() - interval '72 hours' and (ticker is not null or cik is not null) order by at desc limit 40) c;

  select params into prm from inv.screen_runs where name = 'board' order by at desc limit 1;
  v_screen := iris2._inv_screen(nullif(prm->>'max_ps', '')::numeric, nullif(prm->>'max_pb', '')::numeric, nullif(prm->>'max_pe', '')::numeric, coalesce(nullif(prm->>'limit', '')::int, 60));

  select array_agg(x->>'ticker') into tick from (select x from jsonb_array_elements(v_screen->'results') x limit 12) q;
  select coalesce(jsonb_object_agg(ticker, jsonb_build_object('closes', closes, 'first', first_c, 'last', last_c, 'n', n,
           'chg_pct', case when first_c > 0 then round((last_c / first_c - 1) * 100, 2) end, 'hi', hi, 'lo', lo, 'from', d0, 'to', d1)), '{}'::jsonb) into v_sparks
  from (select ticker, jsonb_agg(close order by d) closes, (array_agg(close order by d))[1] first_c, (array_agg(close order by d desc))[1] last_c,
               count(*) n, max(close) hi, min(close) lo, min(d) d0, max(d) d1
          from inv.prices where ticker = any(coalesce(tick, '{}'::text[])) and d >= current_date - 90 group by ticker) q;

  -- sanity flags on screen rows: arithmetic on suspect inputs is shown, not hidden, but it is labelled
  if jsonb_typeof(v_screen->'results') = 'array' then
    v_screen := jsonb_set(v_screen, '{results}', (
      select coalesce(jsonb_agg(r || jsonb_build_object('flags', (
        select coalesce(jsonb_agg(f), '[]'::jsonb) from (
          select 'P/E below 1 — earnings or price input is suspect' f where (r->>'pe')::numeric is not null and (r->>'pe')::numeric > 0 and (r->>'pe')::numeric < 1
          union all select 'price under $1' where (r->>'price')::numeric < 1
          union all select 'market cap under $50M — thin, data-error prone' where (r->>'market_cap')::numeric < 50000000
          union all select 'shares outstanding older than 120 days' where (r->>'shares_asof') is not null and (r->>'shares_asof')::date < current_date - 120
        ) q)) order by (r->>'score')::numeric desc nulls last), '[]'::jsonb)
      from jsonb_array_elements(v_screen->'results') r));
  end if;
  return jsonb_build_object('macro', v_macro, 'pressure', v_pressure,
    'feeds', (select coalesce(jsonb_object_agg(feed, jsonb_build_object('state', state, 'age_s', age_s, 'last_at', last_at, 'expected_s', expected, 'note', note, 'error', last_error)), '{}'::jsonb)
                from ops.feed_health where feed in ('prices', 'macro', 'fundamentals', 'catalysts')),
    'prices_as_of', (select max(d) from inv.prices),
    'catalysts_window_h', 72,
    'catalysts_24h', (select count(*) from inv.catalysts where at > now() - interval '24 hours' and (ticker is not null or cik is not null)),
    'catalysts_untagged_72h', (select count(*) from inv.catalysts where at > now() - interval '72 hours' and ticker is null and cik is null),
    'screen_note', 'Ranks distance below the saved P/S and P/B thresholds on FY-annual EDGAR fundamentals and the newest EOD price; it is a screen, not a valuation and not advice.',
    'pressure_basis', 'inv.ppi_map is a hand-authored input→industry mapping (17 rows); yoy is BLS PPI, latest period vs ≥11 months earlier.',
    'pressure_note', 'Only the year-on-year change is meaningful — PPI levels sit on different bases and must never be compared across series.',
    'catalysts', v_cat, 'screen', v_screen, 'sparks', v_sparks, 'sparks_days', 90);
end $function$;

-- ---- pg_cron stand-in. Production schedules a one-shot job for the recompute; locally the "job" runs immediately.
create schema if not exists cron;
create table if not exists cron.job (jobid bigint generated always as identity primary key, jobname text, schedule text, command text, active boolean default true);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid into v;
  execute p_command;   -- local only: run now instead of at the next minute tick
  return v;
end $$;
create or replace function cron.unschedule(p_name text) returns boolean
language plpgsql as $$ begin delete from cron.job where jobname = p_name; return found; end $$;
