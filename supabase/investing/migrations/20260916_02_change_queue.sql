-- IRIS Investing — Phase 3/4 · the prioritized change queue and versioned thesis records
--
-- The Investing tab's #1 job is "what materially changed in my universe?" — not hundreds of long/short cards. This
-- assembles a single ranked queue from things that actually changed, each with what changed, the observed facts, and
-- what would invalidate it. Everything is deterministic; a model never sets a rank or a number here.
--
--   iris2_investing_queue(p_since_sessions) → { items[], upcoming[], as_of, window }
--     items[]    : material changes to decisions (new publication, direction flip, newly stale) in the window,
--                  each with a change kind, the decision card, and a deterministic priority;
--     upcoming[] : the next scheduled catalysts for watchlist / surfaced names, confirmed vs estimated, with tz.
--
--   market.theses : versioned thesis records (append-only). A thesis is a claim with a mechanism, supporting and
--     contradictory evidence, a next test, an invalidation condition, a horizon and a review date; each edit is a new
--     version, and the current view is the latest non-superseded version per key.
--
-- Rollback at the bottom.

-- ---- versioned thesis records --------------------------------------------------------------------------------
create table if not exists market.theses (
  id            bigint generated always as identity primary key,
  thesis_key    text not null,                          -- stable id for the thesis across versions (e.g. 'NVDA:datacenter-capex')
  version       integer not null default 1,
  symbol        text,
  claim         text not null,
  mechanism     text,                                    -- why the claim would be true
  supporting    jsonb not null default '[]'::jsonb,      -- [{text, source, as_of}]
  contradicting jsonb not null default '[]'::jsonb,
  next_test     text,                                    -- the next observation that would confirm or deny
  invalidation  text,                                    -- what would falsify it
  horizon       text,                                    -- e.g. '1-2 quarters'
  owner         text not null default 'owner',
  status        text not null default 'open',            -- open | confirmed | invalidated | expired | superseded
  review_date   date,
  linked_catalysts uuid[] not null default '{}',         -- inv.catalysts.id that bear on this thesis
  superseded_by bigint references market.theses(id),
  created_at    timestamptz not null default now()
);
create index if not exists theses_key_idx on market.theses (thesis_key, version desc);
comment on table market.theses is 'Append-only versioned thesis records. A change is a new version (version+1) and the old row gets superseded_by; the current thesis is the highest version per thesis_key with superseded_by null. Never updated in place except to set superseded_by.';

create or replace function market.theses_guard() returns trigger
language plpgsql as $$
begin
  -- allow only setting superseded_by / status on an existing row; everything else must be a new version
  if TG_OP = 'DELETE' then raise exception 'market.theses is append-only'; end if;
  if (new.claim, new.mechanism, new.version, new.thesis_key) is distinct from (old.claim, old.mechanism, old.version, old.thesis_key) then
    raise exception 'market.theses versions are immutable; insert a new version instead';
  end if;
  return new;
end $$;
drop trigger if exists theses_immutable on market.theses;
create trigger theses_immutable before update or delete on market.theses
  for each row execute function market.theses_guard();

create or replace view market.theses_current as
  select * from market.theses t where t.superseded_by is null
    and t.version = (select max(t2.version) from market.theses t2 where t2.thesis_key = t.thesis_key and t2.superseded_by is null);

-- ---- the change queue ----------------------------------------------------------------------------------------
create or replace function public.iris2_investing_queue(p_since_sessions integer default 3)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
set statement_timeout to '10s'
as $function$
declare t0 timestamptz := clock_timestamp();
        v_last date := market.last_completed_session(now());
        v_from date := market.session_shift(v_last, -greatest(1, coalesce(p_since_sessions, 3)));
        v_from_ts timestamptz;
begin
  perform brain.require_scope('investing');
  v_from_ts := (select min(open_at) from market.sessions where session_date >= v_from);

  return iris2._ok(jsonb_build_object(
    'as_of', v_last,
    'window', jsonb_build_object('since_sessions', greatest(1, coalesce(p_since_sessions, 3)), 'from', v_from, 'to', v_last),
    -- material decision changes in the window, ranked. Priority is deterministic: a direction flip on a liquid,
    -- high-conviction name outranks a routine new surfacing; a name going stale is surfaced so it is not silently trusted.
    'items', (
      select coalesce(jsonb_agg(x order by (x->>'priority')::numeric desc, (x->>'at') desc), '[]'::jsonb) from (
       select x from (
        select jsonb_build_object(
          'kind', h.change_kind,
          'change', case h.change_kind
              when 'new' then 'New '||h.direction||' — first surfacing'
              when 'direction' then 'Flipped to '||h.direction
              when 'surfaced' then 'Now actionable ('||h.direction||')'
              when 'unsurfaced' then 'No longer actionable'
              else 'Updated' end,
          'symbol', h.symbol, 'direction', h.direction, 'conviction', h.conviction,
          'at', h.published_at, 'as_of', h.as_of, 'price_state', h.price_state,
          'card', market._decision_card(h.symbol),
          'priority', round(
              (case h.change_kind when 'direction' then 60 when 'new' then 45 when 'surfaced' then 40 when 'unsurfaced' then 30 else 15 end)
            + coalesce(h.conviction,0) * 0.4
            + (case when d.close >= 5 and coalesce(te.close*te.vol_avg20,0) >= 20000000 then 15 else 0 end)   -- liquid
            + (case when h.price_state = 'STALE' then -40 else 0 end)                                          -- stale changes rank low
          , 1)
        ) x, h.published_at, h.change_kind, h.priority_hint
        from (
          select distinct on (symbol) symbol, change_kind, direction, conviction, published_at, as_of, price_state, 0 priority_hint
          from market.decision_history
          where published_at >= v_from_ts and change_kind in ('new','direction','surfaced','unsurfaced')
          order by symbol, published_at desc
        ) h
        left join market.decisions d on d.symbol = h.symbol
        left join market.technicals te on te.symbol = h.symbol
        -- newly stale names (actionable yesterday, stale now) are material too
        union all
        select jsonb_build_object(
          'kind', 'stale', 'change', 'Went stale — price feed '||coalesce(d.sessions_behind::text,'?')||' sessions behind',
          'symbol', d.symbol, 'direction', d.direction, 'conviction', d.conviction,
          'at', d.computed_at, 'as_of', d.as_of, 'price_state', d.price_state,
          'card', market._decision_card(d.symbol), 'priority', 20) x, d.computed_at, 'stale'::text, 0
        from market.decisions d
        where d.status = 'stale' and exists (select 1 from market.decision_history h2 where h2.symbol = d.symbol and h2.is_publication)
       ) q order by (x->>'priority')::numeric desc, (x->>'at') desc limit 40
      ) q),
    'items_note', 'Only names whose decision materially changed in the window. Priority ranks direction flips and new actionable calls on liquid, higher-conviction names first; a stale name is shown but ranked low. Deterministic — no model sets a rank.',
    -- upcoming scheduled catalysts for names we track or surface
    'upcoming', (
      select coalesce(jsonb_agg(x order by (x->>'when_ts')), '[]'::jsonb) from (
        select jsonb_build_object(
          'ticker', c.ticker, 'kind', c.kind, 'event_type', c.event_type,
          'headline', c.headline, 'when_ts', c.at, 'when_et', to_char(c.at at time zone 'America/New_York', 'Mon DD HH24:MI')||' ET',
          'confirmed', (c.accepted_at is not null or c.event_type = 'earnings_confirmed'),
          'source', c.source, 'url', c.url) x
        from inv.catalysts c
        where c.at >= now() and c.at <= now() + interval '21 days'
          and c.ticker is not null
          and (exists (select 1 from market.underlyings u where u.symbol = c.ticker)
               or exists (select 1 from market.decisions d where d.symbol = c.ticker and d.surfaced))
        order by c.at limit 20) q),
    'upcoming_note', 'Scheduled catalysts in the next 21 days for watchlist or surfaced names. Confirmed vs estimated is marked; times are ET. Unscheduled announcements are never predicted as facts.',
    'theses_open', (select count(*) from market.theses_current where status = 'open')
  ), t0);
exception when insufficient_privilege then raise;
  when others then return iris2._err(iris2._sqlstate_code(sqlstate), sqlerrm, t0);
end $function$;

do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.iris2_investing_queue(integer) from public, anon;
    grant execute on function public.iris2_investing_queue(integer) to authenticated, service_role;
  end if;
end $g$;

-- Rollback:
--   drop function public.iris2_investing_queue(integer); drop view market.theses_current;
--   drop trigger theses_immutable on market.theses; drop function market.theses_guard(); drop table market.theses;
