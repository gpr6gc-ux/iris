-- IRIS Investing — Phase 2 · market-data foundation (md.*): stable instruments, a configurable liquid watchlist,
-- provider-neutral live observations with full provenance, and per-feed health with explicit states.
--
-- Nothing here is populated by a model. The tables are written only through the token-gated worker lane
-- (iris_md_*), read through the member-scoped owner lane (iris2_md_*). The streaming adapter that fills
-- md.quotes_latest / md.bars_1m lives in the IRIS station (sidecar/market-stream.js); until an entitled key is
-- present it reports DISCONNECTED and writes nothing — a LIVE label can only come from a passing entitlement check.
--
-- Rollback (bottom of file).

create schema if not exists md;

-- ---- instruments: identity is an id, not a ticker --------------------------------------------------------------
create table if not exists md.instruments (
  instrument_id  uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('common','etf','adr','preferred','warrant','unit','right','fund','index','option','other')),
  primary_symbol text not null,
  name           text,
  cik            integer,
  figi           text,
  exchange       text,
  currency       text not null default 'USD',
  listing_state  text not null default 'unknown' check (listing_state in ('active','delisted','suspended','unknown','quarantine')),
  listed_at      date,
  delisted_at    date,
  provider       text,                              -- who asserted this row (sec:company_tickers, massive:reference, manual)
  source_as_of   timestamptz,                        -- the provider's own as-of, when known
  received_at    timestamptz not null default now(),
  quality_flags  text[] not null default '{}',       -- kind_unverified | no_reference_match | symbol_conflict | ...
  schema_version integer not null default 1,
  updated_at     timestamptz not null default now()
);
create unique index if not exists instruments_symbol_live_uk on md.instruments (primary_symbol) where listing_state in ('active','unknown','quarantine','suspended');
create index if not exists instruments_cik_idx on md.instruments (cik) where cik is not null;
comment on table md.instruments is 'Security master. Stable instrument_id; symbol is an attribute. Never deactivate a symbol because one source omitted it — set quality_flags and listing_state = quarantine until a second source confirms.';

create table if not exists md.instrument_symbols (
  instrument_id uuid not null references md.instruments(instrument_id),
  symbol        text not null,
  valid_from    date not null,
  valid_to      date,
  provider      text,
  primary key (instrument_id, symbol, valid_from)
);
comment on table md.instrument_symbols is 'Effective-dated ticker history. A ticker change adds a row and closes the previous one; nothing is overwritten.';

-- ---- watchlist: 20–50 liquid names + benchmark ETFs, configurable ----------------------------------------------
create table if not exists md.watchlist (
  symbol        text primary key,
  instrument_id uuid references md.instruments(instrument_id),
  tier          text not null default 'liquid' check (tier in ('benchmark','liquid','watch')),
  active        boolean not null default true,
  added_at      timestamptz not null default now(),
  note          text
);
comment on table md.watchlist is 'The instruments the live stream subscribes to. Keep it to 20–50; the daily screen covers the rest.';

-- ---- live observations (coalesced) and 1-minute bars -----------------------------------------------------------
create table if not exists md.quotes_latest (
  symbol            text primary key,
  instrument_id     uuid,
  provider          text not null,
  dataset           text not null default '