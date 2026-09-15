-- IRIS Investing — Phase 1 · make the recompute fast enough and the worker call asynchronous
--
-- Measured 2026-09-15 01:05 UTC on production: refresh_decisions() 49 s with the history trigger, 27.5 s without;
-- the whole chain (~62 s) exceeded the API gateway's request limit when the price feed called iris_market_refresh.
-- Three changes:
--   1. the history trigger looks up the previous row by (symbol, id desc) with a matching index;
--   2. sessions_behind is computed once per distinct as_of (5 values) instead of once per decision (1,297);
--   3. iris_market_refresh no longer runs the chain inline: it schedules a one-shot pg_cron job
--      (market-refresh-once) that unschedules itself and takes an advisory lock, so a slow chain can never
--      time out an HTTP caller or run twice concurrently. The 04:15 UTC daily cron remains as the fallback.
--
-- Rollback: drop function market.refresh_all_once(); restore public.iris_market_refresh from 20260915_05;
--   restore market.refresh_decisions and market.decision_history_capture from 20260915_03;
--   drop index market.decision_history_symbol_id_idx;

create index if not exists decision_history_symbol_id_idx on market.decision_history (symbol, id desc);

create or replace function market.decision_history_capture() returns trigger
language plpgsql as $$
declare p market.decision_history%rowtype; kind text; pub boolean;
begin
  select * into p from market.decision_history h where h.symbol = new.symbol order by h.id desc limit 1;
  if p.id is null then kind := 'new';
  elsif p.direction is distinct from new.direction then kind := 'direction';
  elsif (not coalesce(p.surfaced, false)) and coalesce(new.surfaced, false) then kind := 'surfaced';
  elsif coalesce(p.surfaced, false) and not coalesce(new.surfaced, false) then kind := 'unsurfaced';
  elsif p.as_of is distinct from new.as_of or p.status is distinct from new.status
        or abs(coalesce(p.conviction, 0) - coalesce(new.conviction, 0)) >= 5
        or p.stop_basis is distinct from new.stop_basis or p.price_state is distinct from new.price_state then kind := 'update';
  else return new;
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

-- sessions_behind once per distinct as_of (textual patch of the deployed function body; anchors are unique)
do $p$
declare src text; n0 int; n1 int;
begin
  src := pg_get_functiondef('market.refresh_decisions()'::regprocedure);
  n0 := length(src);
  src := replace(src, 'with reg as (select * from market.regime order by as_of desc limit 1),',
                      'with reg as (select * from market.regime order by as_of desc limit 1),' || E'\n' ||
                      '  beh as (select t.as_of, market.sessions_behind(t.as_of, v_now) as behind from (select distinct as_of from market.technicals) t),');
  src := replace(src, 'market.sessions_behind(as_of, v_now) as behind', 'beh.behind');
  src := replace(src, E'    from d3b\n  ),\n  d4 as (', E'    from d3b join beh on beh.as_of = d3b.as_of\n  ),\n  d4 as (');
  n1 := length(src);
  if n1 = n0 then raise exception 'refresh_decisions patch anchors not found'; end if;
  execute src;
end $p$;

create or replace function market.refresh_all_once() returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
begin
  perform cron.unschedule('market-refresh-once');
  if pg_try_advisory_lock(hashtext('market.refresh_all')) then
    begin
      perform market.refresh_all();
    exception when others then
      perform pg_advisory_unlock(hashtext('market.refresh_all'));
      raise;
    end;
    perform pg_advisory_unlock(hashtext('market.refresh_all'));
  end if;
end $$;
revoke execute on function market.refresh_all_once() from public;

create or replace function public.iris_market_refresh(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '15s'
as $function$
begin
  perform brain.check_app_token(p_token);
  if exists (select 1 from cron.job where jobname = 'market-refresh-once') then
    return jsonb_build_object('ok', true, 'scheduled', 'market-refresh-once', 'state', 'already pending');
  end if;
  perform cron.schedule('market-refresh-once', '* * * * *', 'select market.refresh_all_once()');
  return jsonb_build_object('ok', true, 'scheduled', 'market-refresh-once', 'state', 'runs at the next minute',
    'note', 'asynchronous: technicals -> regime -> decisions -> macro read; watch market.decisions.computed_at');
end $function$;
