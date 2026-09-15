-- IRIS Investing — Phase 1 · give the bulk price loader its own statement budget
-- The loader inherited the API role's default statement_timeout; a 3,000-row upsert under load was cancelled and the
-- session ended up partially loaded (seen on the first run of the repaired feed, 2026-09-15 00:52 UTC: 4 of 5 chunks
-- per session cancelled). Same remedy as the chain ingest: a 120 s budget of its own, plus timing in the reply.
--
-- Rollback: restore public.iris_inv_prices_bulk from functions_investing.sql.
CREATE OR REPLACE FUNCTION public.iris_inv_prices_bulk(p_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'inv', 'extensions'
 SET statement_timeout TO '120s'
AS $function$
declare n int := 0; t0 timestamptz := clock_timestamp();
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
  return jsonb_build_object('ok', true, 'rows', n, 'took_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end $function$;
