-- IRIS Investing — Phase 2 · provider-neutral market-data contract (md.*)
--
-- A thin, vendor-agnostic layer that live ingestion writes to and the app reads from, so a provider can be swapped
-- without touching the app. Nothing here fetches; the station's streaming adapter (sidecar/market-stream.js) and the
-- n8n feeds are the only writers, through token-gated RPCs. Instrument identity is stable and effective-dated so a
-- ticker change never loses history, and every observation keeps its provenance and a truthful state — a LIVE label
-- is only ever written by a connected, entitled stream.
--
-- Rollback at the bottom.

create schema if not exists md;

-- ---- instruments: the security master. Stable md_id survives ticker changes; symbols are effective-dated. --------
create table if not exists md.instruments (
  md_id         bigint generated always as identity primary key,
  kind          text not null default 'equity',          -- equity | etf | index | option
  primary_symbol text,                                    -- current display ticker (denormalized for convenience)
  figi          text,                                     -- OpenFIGI if ever available (stable across ticker changes)
  cik           integer,                                  -- SEC issuer, when mapped
  name          text,
  listing_state text not null default 'active',           -- active | delisted | quarantined | unknown
  first_seen    date not null default current_date,
  last_seen     date,
  provider      text,                                     -- who last confirmed this instrument
  quality_flags text[] not null default '{}',
  meta          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);
create unique index if not exists md_instruments_symbol_uk on md.instruments (primary_symbol) where primary_symbol is not null and listing_state <> 'quarantined';
create index if not exists md_instruments_cik_idx on md.instruments (cik) where cik is not null;
comment on table md.instruments is 'Security master. Ticker alone is insufficient identity; md_id is the stable key. A symbol disappearing from ONE source never deactivates a row — only a confirmed delisting sets listing_state = delisted; ambiguous rows go to quarantined and keep their history.';

create table if not exists md.symbols (               -- effective-dated ticker → instrument mapping
  md_id       bigint not null references md.instruments(md_id),
  symbol      text not null,
  valid_from  date not null default current_date,
  valid_to    date,                                    -- null = current
  provider    text,
  primary key (md_id, symbol, valid_from)
);
create index if not exists md_symbols_symbol_idx on md.symbols (symbol, valid_from desc);
comment on table md.symbols is 'Effective-dated ticker history. A ticker change adds a row (old one gets valid_to) — prices keyed on md_id stay attached across the change.';

-- ---- watchlist: the 20–50 liquid names live ingestion covers, plus the benchmark ETFs. --------------------------
create table if not exists md.watchlist (
  symbol     text primary key,
  md_id      bigint references md.instruments(md_id),
  name       text,
  kind       text not null default 'equity',
  is_benchmark boolean not null default false,
  priority   integer not null default 100,
  active     boolean not null default true,
  added_at   timestamptz not null default now(),
  note       text
);
comment on table md.watchlist is 'The liquid names the streaming layer subscribes to (20–50). Benchmarks (SPY/QQQ/IWM/DIA) are members so their live quote is available; broader daily screening stays in inv.prices.';

insert into md.watchlist (symbol, name, kind, is_benchmark, priority) values
  ('SPY','S&P 500 ETF','etf',true,10),('QQQ','Nasdaq-100 ETF','etf',true,20),('IWM','Russell 2000 ETF','etf',true,30),('DIA','Dow Jones ETF','etf',true,40),
  ('NVDA','NVIDIA','equity',false,50),('TSLA','Tesla','equity',false,60),('AAPL','Apple','equity',false,70),('AMD','AMD','equity',false,80),
  ('META','Meta','equity',false,90),('MSFT','Microsoft','equity',false,100),('AMZN','Amazon','equity',false,110),('GOOGL','Alphabet','equity',false,120)
on conflict (symbol) do nothing;

-- ---- quotes_latest: one row per symbol, the newest observation with full provenance and a truthful state. --------
create table if not exists md.quotes_latest (
  symbol          text primary key,
  md_id           bigint references md.instruments(md_id),
  last            numeric,
  bid             numeric,
  ask             numeric,
  session_volume  bigint,
  provider        text not null,
  dataset         text,                                  -- e.g. 'stocks/aggregates/second', 'stocks/quotes'
  event_time      timestamptz,                           -- when the market event occurred (provider)
  received_at     timestamptz not null default now(),    -- when the adapter received it
  entitlement_delay_s integer,                           -- declared delay of the entitlement (0 = real-time, 900 = 15-min)
  state           text not null default 'DISCONNECTED',  -- LIVE | DELAYED | LAST_SESSION | STALE | HALTED | DISCONNECTED | UNAVAILABLE
  quality_flags   text[] not null default '{}',
  source_seq      bigint,                                -- provider sequence / message id for dedupe
  meta            jsonb not null default '{}'::jsonb
);
comment on table md.quotes_latest is 'Coalesced latest quote per watchlist symbol. state is the truth about the feed: LIVE only from a connected, entitled real-time stream; DELAYED for an entitled delayed stream; DISCONNECTED when no adapter is writing. event_time and received_at are always distinct fields.';
comment on column md.quotes_latest.state is 'LIVE=connected real-time; DELAYED=connected delayed feed within its delay+grace; LAST_SESSION=no live feed but last observation is the last completed session; STALE=older; HALTED=provider says halted; DISCONNECTED=no adapter writing; UNAVAILABLE=never seen.';

-- ---- feed_state: one row per dataset the ingestion layer owns; the health surface for monitors and the station. ---
create table if not exists md.feed_state (
  feed         text primary key,                          -- 'stocks.quotes', 'options.chains', ...
  provider     text,
  transport    text,                                      -- 'websocket' | 'rest'
  connected    boolean not null default false,
  last_heartbeat_at timestamptz,
  last_message_at   timestamptz,
  entitlement  text,                                      -- 'real-time' | 'delayed-15m' | 'eod' | 'none'
  symbols_subscribed integer,
  messages_1m  integer,
  gaps_detected integer not null default 0,
  p50_lag_ms   integer, p95_lag_ms integer, p99_lag_ms integer,
  state        text not null default 'DISCONNECTED',
  note         text,
  updated_at   timestamptz not null default now()
);
comment on table md.feed_state is 'Per-dataset live health for the streaming layer, distinct from iris.feed_health (scheduled feeds). transport lag percentiles and gap counts are measured, not guessed.';

-- ---- ingest quotes (worker lane). Batched by the adapter; one round trip per flush, not per tick. ----------------
create or replace function public.iris_md_quotes_upsert(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '30s'
as $function$
declare n int := 0;
begin
  perform brain.check_app_token(p_token);
  with src as (
    select upper(r->>'symbol') symbol,
           nullif(r->>'last','')::numeric last, nullif(r->>'bid','')::numeric bid, nullif(r->>'ask','')::numeric ask,
           nullif(r->>'session_volume','')::bigint session_volume,
           coalesce(r->>'provider','unknown') provider, r->>'dataset' dataset,
           nullif(r->>'event_time','')::timestamptz event_time,
           coalesce(nullif(r->>'received_at','')::timestamptz, now()) received_at,
           nullif(r->>'entitlement_delay_s','')::int entitlement_delay_s,
           coalesce(r->>'state','DELAYED') state,
           coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'quality_flags','[]'::jsonb)) x), '{}') quality_flags,
           nullif(r->>'source_seq','')::bigint source_seq
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) r
    where nullif(r->>'symbol','') is not null
      and exists (select 1 from md.watchlist w where w.symbol = upper(r->>'symbol'))
      and coalesce(r->>'state','') in ('LIVE','DELAYED','LAST_SESSION','STALE','HALTED')  -- an adapter cannot assert DISCONNECTED/UNAVAILABLE for a row it is delivering
  ), u as (
    insert into md.quotes_latest as q (symbol, md_id, last, bid, ask, session_volume, provider, dataset, event_time, received_at, entitlement_delay_s, state, quality_flags, source_seq)
    select s.symbol, (select md_id from md.watchlist w where w.symbol = s.symbol), s.last, s.bid, s.ask, s.session_volume, s.provider, s.dataset, s.event_time, s.received_at, s.entitlement_delay_s, s.state, s.quality_flags, s.source_seq
    from src s
    on conflict (symbol) do update set
      last = coalesce(excluded.last, q.last), bid = coalesce(excluded.bid, q.bid), ask = coalesce(excluded.ask, q.ask),
      session_volume = coalesce(excluded.session_volume, q.session_volume),
      provider = excluded.provider, dataset = excluded.dataset,
      event_time = excluded.event_time, received_at = excluded.received_at,
      entitlement_delay_s = excluded.entitlement_delay_s, state = excluded.state,
      quality_flags = excluded.quality_flags, source_seq = excluded.source_seq
      where excluded.event_time is null or q.event_time is null or excluded.event_time >= q.event_time  -- never overwrite a newer event with an older one
    returning 1
  )
  select count(*) into n from u;
  return jsonb_build_object('ok', true, 'rows', n);
end $function$;

-- ---- feed heartbeat (worker lane). The adapter reports connection health here every few seconds. ----------------
create or replace function public.iris_md_feed_state(p_token text, p_feed text, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '10s'
as $function$
begin
  perform brain.check_app_token(p_token);
  insert into md.feed_state as f (feed, provider, transport, connected, last_heartbeat_at, last_message_at, entitlement,
      symbols_subscribed, messages_1m, gaps_detected, p50_lag_ms, p95_lag_ms, p99_lag_ms, state, note, updated_at)
  values (p_feed, p_state->>'provider', p_state->>'transport', coalesce((p_state->>'connected')::boolean, false),
      coalesce(nullif(p_state->>'last_heartbeat_at','')::timestamptz, now()), nullif(p_state->>'last_message_at','')::timestamptz,
      p_state->>'entitlement', nullif(p_state->>'symbols_subscribed','')::int, nullif(p_state->>'messages_1m','')::int,
      coalesce(nullif(p_state->>'gaps_detected','')::int, 0), nullif(p_state->>'p50_lag_ms','')::int, nullif(p_state->>'p95_lag_ms','')::int, nullif(p_state->>'p99_lag_ms','')::int,
      coalesce(p_state->>'state','DISCONNECTED'), p_state->>'note', now())
  on conflict (feed) do update set
    provider = excluded.provider, transport = excluded.transport, connected = excluded.connected,
    last_heartbeat_at = excluded.last_heartbeat_at, last_message_at = coalesce(excluded.last_message_at, f.last_message_at),
    entitlement = excluded.entitlement, symbols_subscribed = excluded.symbols_subscribed, messages_1m = excluded.messages_1m,
    gaps_detected = excluded.gaps_detected, p50_lag_ms = excluded.p50_lag_ms, p95_lag_ms = excluded.p95_lag_ms, p99_lag_ms = excluded.p99_lag_ms,
    state = excluded.state, note = excluded.note, updated_at = now();
  return jsonb_build_object('ok', true, 'feed', p_feed);
end $function$;

-- ---- read side (owner+member). Quotes are recomputed to a truthful state at read time: a stored LIVE/DELAYED that
-- has gone quiet longer than its delay+grace, or whose feed is not connected, is downgraded so the UI never shows a
-- live badge over a dead feed.
create or replace function public.iris2_md_quotes()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '8s'
as $function$
declare t0 timestamptz := clock_timestamp();
begin
  perform brain.require_scope('investing');
  return iris2._ok(jsonb_build_object(
    'quotes', (select coalesce(jsonb_agg(jsonb_build_object(
        'symbol', w.symbol, 'name', w.name, 'is_benchmark', w.is_benchmark, 'priority', w.priority,
        'last', q.last, 'bid', q.bid, 'ask', q.ask, 'session_volume', q.session_volume,
        'provider', q.provider, 'event_time', q.event_time, 'received_at', q.received_at,
        'entitlement_delay_s', q.entitlement_delay_s,
        'state', case
           when q.symbol is null then 'UNAVAILABLE'
           when not coalesce(fs.connected, false) then case when q.event_time is not null and market.sessions_behind((q.event_time at time zone 'America/New_York')::date, now()) = 0 then 'LAST_SESSION' else 'DISCONNECTED' end
           when q.state in ('LIVE','DELAYED') and q.received_at < now() - make_interval(secs => coalesce(q.entitlement_delay_s,0) + 120) then 'STALE'
           else q.state end) order by w.priority), '[]'::jsonb)
      from md.watchlist w left join md.quotes_latest q on q.symbol = w.symbol
      left join md.feed_state fs on fs.feed = 'stocks.quotes'
      where w.active),
    'feed', (select to_jsonb(f) from (select feed, provider, transport, connected, entitlement, state, symbols_subscribed, messages_1m, gaps_detected, p50_lag_ms, p95_lag_ms, p99_lag_ms, last_heartbeat_at, last_message_at, note from md.feed_state where feed = 'stocks.quotes') f),
    'note', 'Live quotes for the watchlist. state is the truth about the feed at read time — DISCONNECTED means no adapter is streaming; LIVE requires a connected, entitled real-time stream. Decision-support, not advice.'
  ), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$;

do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.iris_md_quotes_upsert(text,jsonb) to anon, authenticated, service_role;
    grant execute on function public.iris_md_feed_state(text,text,jsonb) to anon, authenticated, service_role;
    grant execute on function public.iris2_md_quotes() to authenticated, service_role;
    revoke execute on function public.iris2_md_quotes() from public, anon;
  end if;
end $g$;

-- Rollback:
--   drop function public.iris2_md_quotes(); drop function public.iris_md_feed_state(text,text,jsonb);
--   drop function public.iris_md_quotes_upsert(text,jsonb);
--   drop table md.feed_state; drop table md.quotes_latest; drop table md.watchlist; drop table md.symbols; drop table md.instruments;
--   drop schema md;
