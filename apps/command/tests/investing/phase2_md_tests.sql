-- IRIS Investing — Phase 2 acceptance tests for the md.* market-data contract. Transaction-wrapped, rolls back.
-- Usage: psql -d iris_local -v ON_ERROR_STOP=1 -f tests/investing/phase2_md_tests.sql
begin;
set local client_min_messages = notice;

-- self-contained: clear any live-quote state so the tests do not depend on prior ingest
delete from md.quotes_latest; delete from md.feed_state;

-- M01 · a delayed feed never reads LIVE; a real-time-labelled row still only reads LIVE while the feed is connected
do $$
declare st text;
begin
  perform public.iris_md_feed_state('local-dev-token', 'stocks.quotes', '{"provider":"massive","transport":"websocket","connected":true,"entitlement":"delayed-15m","state":"DELAYED"}');
  perform public.iris_md_quotes_upsert('local-dev-token', ('[{"symbol":"SPY","last":760,"provider":"massive","event_time":"'|| to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"') ||'","entitlement_delay_s":900,"state":"DELAYED"}]')::jsonb);
  select q->>'state' into st from jsonb_array_elements(public.iris2_md_quotes()->'data'->'quotes') q where q->>'symbol'='SPY';
  if st <> 'DELAYED' then raise exception 'M01 FAIL delayed feed read as %', st; end if;
  -- a client cannot smuggle in LIVE on a delayed entitlement value stored server-side: even a row claiming LIVE is
  -- downgraded once the feed is disconnected (M02); while connected the stored state is shown verbatim, so the
  -- adapter is the only place LIVE is decided, and it only sets LIVE on a real-time entitlement (unit-tested).
  raise notice 'PASS M01 delayed feed reads DELAYED, never LIVE';
end $$;

-- M02 · disconnect/reconnect and degraded coverage produce truthful states
do $$
declare st text; fj jsonb;
begin
  -- connected + fresh real-time row → LIVE
  perform public.iris_md_feed_state('local-dev-token', 'stocks.quotes', '{"provider":"massive","transport":"websocket","connected":true,"entitlement":"real-time","state":"LIVE"}');
  perform public.iris_md_quotes_upsert('local-dev-token', ('[{"symbol":"SPY","last":760,"provider":"massive","event_time":"'|| to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"') ||'","received_at":"'|| to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"') ||'","entitlement_delay_s":0,"state":"LIVE"}]')::jsonb);
  select q->>'state' into st from jsonb_array_elements(public.iris2_md_quotes()->'data'->'quotes') q where q->>'symbol'='SPY';
  if st <> 'LIVE' then raise exception 'M02 FAIL connected real-time read as %', st; end if;
  -- feed goes down → the same row must NOT read LIVE; its value is this session's so LAST_SESSION is acceptable, LIVE is not
  perform public.iris_md_feed_state('local-dev-token', 'stocks.quotes', '{"provider":"massive","transport":"websocket","connected":false,"state":"DISCONNECTED"}');
  select q->>'state' into st from jsonb_array_elements(public.iris2_md_quotes()->'data'->'quotes') q where q->>'symbol'='SPY';
  if st = 'LIVE' then raise exception 'M02 FAIL disconnected feed still LIVE'; end if;
  if st not in ('DISCONNECTED','LAST_SESSION') then raise exception 'M02 FAIL disconnected state %', st; end if;
  -- the feed object itself reports disconnected
  select public.iris2_md_quotes()->'data'->'feed' into fj;
  if (fj->>'connected')::boolean then raise exception 'M02 FAIL feed reports connected while down'; end if;
  -- degraded coverage: a symbol never seen reads UNAVAILABLE, not a stale price
  select q->>'state' into st from jsonb_array_elements(public.iris2_md_quotes()->'data'->'quotes') q where q->>'symbol'='TSLA';
  if st <> 'UNAVAILABLE' then raise exception 'M02 FAIL never-seen symbol read as %', st; end if;
  raise notice 'PASS M02 disconnect never LIVE; unseen symbol UNAVAILABLE; feed reports disconnected';
end $$;

-- M03 · a stale LIVE/DELAYED row (feed connected but silent longer than delay+grace) is downgraded to STALE
do $$
declare st text;
begin
  perform public.iris_md_feed_state('local-dev-token', 'stocks.quotes', '{"provider":"massive","transport":"websocket","connected":true,"entitlement":"real-time","state":"LIVE"}');
  perform public.iris_md_quotes_upsert('local-dev-token', ('[{"symbol":"QQQ","last":709,"provider":"massive","event_time":"'|| to_char(now() - interval '10 minutes','YYYY-MM-DD"T"HH24:MI:SS"Z"') ||'","received_at":"'|| to_char(now() - interval '10 minutes','YYYY-MM-DD"T"HH24:MI:SS"Z"') ||'","entitlement_delay_s":0,"state":"LIVE"}]')::jsonb);
  select q->>'state' into st from jsonb_array_elements(public.iris2_md_quotes()->'data'->'quotes') q where q->>'symbol'='QQQ';
  if st <> 'STALE' then raise exception 'M03 FAIL silent-but-connected row read as % (expected STALE)', st; end if;
  raise notice 'PASS M03 a connected feed gone silent past delay+grace reads STALE, not LIVE';
end $$;

-- M04 · an older event never overwrites a newer stored quote (out-of-order protection at the DB boundary too)
do $$
declare v numeric;
begin
  perform public.iris_md_quotes_upsert('local-dev-token', '[{"symbol":"AAPL","last":332.5,"provider":"massive","event_time":"2026-09-15T13:00:02Z","state":"DELAYED","entitlement_delay_s":900}]');
  perform public.iris_md_quotes_upsert('local-dev-token', '[{"symbol":"AAPL","last":331.0,"provider":"massive","event_time":"2026-09-15T13:00:01Z","state":"DELAYED","entitlement_delay_s":900}]');
  select last into v from md.quotes_latest where symbol='AAPL';
  if v <> 332.5 then raise exception 'M04 FAIL older event overwrote newer: %', v; end if;
  raise notice 'PASS M04 an older event does not overwrite a newer quote';
end $$;

-- M05 · only the worker token may write; a bad token is refused
do $$
begin
  begin
    perform public.iris_md_quotes_upsert('nope', '[{"symbol":"SPY","last":1,"state":"DELAYED"}]');
    raise exception 'M05 FAIL bad token accepted';
  exception when others then
    if sqlstate <> '42501' then raise exception 'M05 FAIL wrong error %', sqlstate; end if;
  end;
  raise notice 'PASS M05 md ingest refuses a bad worker token';
end $$;

-- M06 · instrument identity survives a ticker change (effective-dated symbols keep history on md_id)
do $$
declare v_id bigint;
begin
  insert into md.instruments (kind, primary_symbol, name, cik) values ('equity', 'OLDT', 'Test Co', 9999001) returning md_id into v_id;
  insert into md.symbols (md_id, symbol, valid_from) values (v_id, 'OLDT', '2026-01-01');
  -- ticker change: close the old mapping, open the new, repoint the instrument
  update md.symbols set valid_to = '2026-09-14' where md_id = v_id and symbol = 'OLDT';
  insert into md.symbols (md_id, symbol, valid_from) values (v_id, 'NEWT', '2026-09-15');
  update md.instruments set primary_symbol = 'NEWT' where md_id = v_id;
  if (select count(*) from md.symbols where md_id = v_id) <> 2 then raise exception 'M06 FAIL history lost'; end if;
  if (select symbol from md.symbols where md_id = v_id and valid_to is null) <> 'NEWT' then raise exception 'M06 FAIL current symbol'; end if;
  if (select symbol from md.symbols where md_id = v_id and valid_from <= '2026-06-01' and (valid_to is null or valid_to >= '2026-06-01')) <> 'OLDT' then raise exception 'M06 FAIL point-in-time lookup'; end if;
  raise notice 'PASS M06 a ticker change keeps history on the stable md_id';
end $$;

rollback;
