-- IRIS investing schema reference (generated 2026-09-14)
-- Tables of inv.* and market.* with primary keys and column defaults. Indexes, RLS and grants are omitted on purpose.
create schema if not exists inv;
create schema if not exists market;

create table inv.catalysts (
  id uuid not null default gen_random_uuid(),
  at timestamp with time zone not null default now(),
  kind text not null,
  headline text not null,
  detail text,
  url text,
  source text not null,
  tickers text[],
  industries text[],
  score numeric,
  status text not null default 'new',
  cik integer,
  ticker text,
  company text,
  event_type text,
  item_code text,
  items text[],
  accession text,
  filed_at date,
  accepted_at timestamp with time zone,
  primary key (id)
);

create table inv.earnings_actuals (
  accession text not null,
  cik integer,
  ticker text,
  period_end date,
  eps_gaap numeric,
  eps_non_gaap numeric,
  revenue numeric,
  currency text default 'USD',
  exhibit_url text,
  extracted_by text,
  confidence numeric,
  extracted_at timestamp with time zone not null default now(),
  primary key (accession)
);

create table inv.earnings_estimates (
  ticker text not null,
  report_date date not null,
  fiscal_date_ending date,
  estimate_eps numeric,
  currency text default 'USD',
  time_of_day text,
  source text not null default 'alphavantage:EARNINGS_CALENDAR',
  updated_at timestamp with time zone not null default now(),
  primary key (ticker, report_date)
);

create table inv.earnings_vs_estimate (
  ticker text,
  company text,
  cik integer,
  accession text,
  filed_at date,
  accepted_at timestamp with time zone,
  report_date date,
  fiscal_date_ending date,
  estimate_eps numeric,
  time_of_day text,
  estimate_source text,
  eps_gaap numeric,
  eps_non_gaap numeric,
  revenue numeric,
  exhibit_url text,
  extracted_by text,
  confidence numeric,
  actual_eps numeric,
  surprise_pct numeric,
  filing_url text
);

create table inv.facts (
  cik integer not null,
  concept text not null,
  unit text not null,
  start_d date not null,
  end_d date not null,
  val numeric not null,
  form text,
  filed date,
  accn text,
  primary key (cik, concept, unit, start_d, end_d)
);

create table inv.fundamentals (
  cik integer not null,
  revenue_ttm numeric,
  revenue_asof date,
  revenue_basis text,
  equity numeric,
  equity_end date,
  shares numeric,
  shares_asof date,
  shares_src text,
  assets numeric,
  liabilities numeric,
  cash numeric,
  debt numeric,
  currency text not null default 'USD',
  computed_at timestamp with time zone not null default now(),
  note text,
  net_income_ttm numeric,
  net_income_asof date,
  net_income_basis text,
  primary key (cik)
);

create table inv.macro (
  series_id text not null,
  d date not null,
  value numeric,
  label text,
  unit text,
  source text not null default 'FRED fredgraph.csv',
  primary key (series_id, d)
);

create table inv.mna_signals (
  id uuid not null default gen_random_uuid(),
  accession text,
  filed_date date,
  company text,
  cik text,
  form text,
  title text,
  url text,
  snippet text,
  healthcare boolean default true,
  created_at timestamp with time zone default now(),
  primary key (id)
);

create table inv.ppi (
  series_id text not null,
  period date not null,
  value numeric not null,
  label text,
  industry text,
  source text not null default 'BLS producer price index',
  primary key (series_id, period)
);

create table inv.ppi_map (
  series_id text not null,
  input_name text not null,
  beneficiary_sic text[],
  victim_sic text[],
  rationale text,
  primary key (series_id)
);

create table inv.prices (
  ticker text not null,
  d date not null,
  close numeric not null,
  volume bigint,
  source text not null,
  primary key (ticker, d)
);

create table inv.screen_runs (
  id uuid not null default gen_random_uuid(),
  name text not null,
  params jsonb not null,
  n integer not null default 0,
  results jsonb not null default '[]'::jsonb,
  at timestamp with time zone not null default now(),
  primary key (id)
);

create table inv.securities (
  cik integer not null,
  ticker text not null,
  exchange text,
  name text,
  sic text,
  sic_desc text,
  kind text not null default 'common',
  is_active boolean not null default true,
  excluded_reason text,
  updated_at timestamp with time zone not null default now(),
  primary key (cik)
);

create table inv.theses (
  id uuid not null default gen_random_uuid(),
  ticker text not null,
  stance text not null,
  headline text not null,
  thesis text,
  evidence jsonb not null default '[]'::jsonb,
  score numeric,
  status text not null default 'open',
  created_by text not null default 'analyst-invest',
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

create table market.backtest_runs (
  id uuid not null default gen_random_uuid(),
  strategy_id uuid,
  label text,
  as_of timestamp with time zone not null default now(),
  config jsonb not null default '{}'::jsonb,
  universe text[],
  n_trials integer,
  best jsonb,
  deflated jsonb,
  walk_forward jsonb,
  critic jsonb,
  gate_leakage boolean,
  gate_deflated boolean,
  gate_walkforward boolean,
  tradeable boolean,
  notes text,
  created_by text not null default 'agent',
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

create table market.chain_snapshots (
  id uuid not null default gen_random_uuid(),
  symbol text not null,
  as_of timestamp with time zone not null,
  captured_at timestamp with time zone not null default now(),
  spot numeric,
  net_gex numeric,
  zero_gamma numeric,
  call_wall numeric,
  put_wall numeric,
  regime text,
  total_call_oi bigint,
  total_put_oi bigint,
  put_call_oi_ratio numeric,
  contracts integer,
  expiries integer,
  meta jsonb not null default '{}'::jsonb,
  primary key (id)
);

create table market.decisions (
  symbol text not null,
  as_of date,
  name text,
  close numeric,
  direction text,
  posture text,
  conviction integer,
  conviction_band text,
  dir_score numeric,
  dir_raw numeric,
  options_posture text,
  headline text,
  entry_ref numeric,
  stop_ref numeric,
  target_ref numeric,
  rr numeric,
  regime_state text,
  gate_fresh boolean,
  gate_multidim boolean,
  gate_verified boolean,
  gate_explained boolean,
  surfaced boolean,
  status text,
  has_fundamentals boolean,
  why jsonb,
  factors jsonb,
  computed_at timestamp with time zone not null default now(),
  risk_pct numeric,
  primary key (symbol)
);

create table market.gamma_grid (
  snapshot_id uuid not null,
  symbol text not null,
  as_of timestamp with time zone not null,
  expiry date not null,
  strike numeric not null,
  call_oi bigint,
  put_oi bigint,
  call_gamma numeric,
  put_gamma numeric,
  call_vol bigint,
  put_vol bigint,
  dealer_gex numeric,
  primary key (snapshot_id, expiry, strike)
);

create table market.macro_read (
  id uuid not null default gen_random_uuid(),
  as_of timestamp with time zone not null default now(),
  rate_10y numeric,
  curve_2s10s numeric,
  curve_10y3m numeric,
  regime_state text,
  breadth_50 numeric,
  mkt_rvol numeric,
  gex_regime text,
  momentum_breadth numeric,
  score integer,
  posture text,
  confidence text,
  drivers jsonb,
  narrative text,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

create table market.regime (
  as_of date not null,
  state text,
  stability integer,
  shaky boolean,
  breadth_above50 numeric,
  breadth_above200 numeric,
  breadth_rsi_bull numeric,
  net_1m numeric,
  mkt_ret_1m numeric,
  mkt_rvol numeric,
  mkt_rvol_pctile numeric,
  mkt_above_sma50 boolean,
  curve_2s10s numeric,
  gex_regime text,
  factors jsonb,
  computed_at timestamp with time zone not null default now(),
  primary key (as_of)
);

create table market.signal_outcomes (
  signal_id uuid not null,
  horizon text not null,
  spot_at_signal numeric,
  spot_forward numeric,
  ret numeric,
  mkt_ret numeric,
  ar numeric,
  car numeric,
  success boolean,
  evaluated_at timestamp with time zone,
  primary key (signal_id, horizon)
);

create table market.signals (
  id uuid not null default gen_random_uuid(),
  symbol text not null,
  as_of timestamp with time zone not null,
  kind text not null,
  behavior text,
  direction integer,
  conviction numeric,
  conviction_band text,
  novelty numeric,
  noise_prob numeric,
  regime text,
  confirmations integer,
  gate_fresh boolean,
  gate_multidim boolean,
  gate_verified boolean,
  gate_explained boolean,
  surfaced boolean not null default false,
  gate_detail jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  factors jsonb not null default '{}'::jsonb,
  invalidation text,
  headline text,
  status text not null default 'open',
  dedupe_key text,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

create table market.strategies (
  id uuid not null default gen_random_uuid(),
  key text not null,
  name text not null,
  kind text not null,
  params jsonb not null default '{}'::jsonb,
  universe text[],
  thesis text,
  status text not null default 'draft',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

create table market.technical_reads (
  symbol text not null,
  as_of date,
  close numeric,
  d_rsi14 numeric,
  d_sma20 numeric,
  d_sma50 numeric,
  d_roc_1m numeric,
  d_roc_3m numeric,
  pos_52w numeric,
  n_bars integer,
  w_rsi14 numeric,
  w_sma10 numeric,
  w_sma20 numeric,
  w_trend text,
  momentum_score integer,
  momentum_state text,
  direction integer,
  read text,
  factors jsonb,
  computed_at timestamp with time zone not null default now(),
  primary key (symbol)
);

create table market.technicals (
  symbol text not null,
  as_of date not null,
  close numeric,
  prev_close numeric,
  chg_1d numeric,
  sma20 numeric,
  sma50 numeric,
  sma200 numeric,
  bb_mid numeric,
  bb_upper numeric,
  bb_lower numeric,
  bb_pctb numeric,
  bb_bw numeric,
  rsi14 numeric,
  ret_1w numeric,
  ret_1m numeric,
  ret_3m numeric,
  ret_6m numeric,
  hi_52w numeric,
  lo_52w numeric,
  pos_52w numeric,
  rvol_20 numeric,
  dvol_pct14 numeric,
  vol_avg20 numeric,
  vol_z numeric,
  dist_sma50 numeric,
  dist_sma200 numeric,
  trend_stack integer,
  cross_state text,
  n_obs integer,
  computed_at timestamp with time zone not null default now(),
  primary key (symbol)
);

create table market.theme_symbols (
  theme_key text not null,
  symbol text not null,
  name text,
  beta_bucket text,
  role text default 'core',
  note text,
  added_at timestamp with time zone not null default now(),
  primary key (theme_key, symbol)
);

create table market.themes (
  key text not null,
  name text not null,
  thesis text,
  risk_posture text default 'high_beta',
  sort integer default 100,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  primary key (key)
);

create table market.underlyings (
  symbol text not null,
  name text,
  kind text not null default 'etf',
  cboe_symbol text not null,
  active boolean not null default true,
  priority integer not null default 100,
  added_at timestamp with time zone not null default now(),
  primary key (symbol)
);
