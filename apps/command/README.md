# IRIS Command 5.0 — web client

The owner's agentic operating-system console. Static web app, no build step, no framework: vanilla ES modules + the
ModelLens Web design system (`design/tokens.css` is byte-identical to ModelLens Web; `styles.css` reuses its component
blocks). Backend: Supabase Auth + PostgREST RPC v2 (`public.iris2_*`, see `docs/IRIS5_RPC_CONTRACTS.md` in the mlv2 repo).

Live: https://iris-command-5.netlify.app · Netlify project `iris-command-5` (the old board `iris-command` keeps running until cutover).

## Structure

```
index.html            app shell + theme boot script (no flash of the wrong mode); loads js/vendor/supabase.js then js/app.js
netlify.toml          publish ".", CSP + security headers, cache rules, hash-router redirect
design/tokens.css     ModelLens design tokens (verbatim): six hues, light/dark, glow, keyframes
styles.css            [ML] blocks reused from ModelLens Web + [IRIS] components from the design canvas
js/config.js          PUBLIC config only: Supabase URL, publishable key, realtime channel, ModelLens Web URL
js/app.js             shell: auth gate, hash router, sidebar (Operate/Domains/System + badges), topbar chips, ⌘K palette,
                      ⌘J Tell IRIS sheet, shortcuts (g m/d/a/r/p/e/k/b/i/n/v/s, ?), preview banner, phone bottom tabs
js/api.js             api.call(fn, args): PostgREST POST /rest/v1/rpc/<fn> with Bearer <session JWT> + apikey, envelope →
                      data | throw {code,message}; in preview mode routes to js/fixtures with no network
js/auth.js            supabase-js client (implicit flow, detectSessionInUrl, localStorage), password / sign-up / magic link / sign-out
js/realtime.js        broadcast channel iris:stream (private) → falls back to iris2_stream polling every 30 s
js/store.js           prefs (theme/mode/density), preview flag, session/owner, cached mission KPIs, event bus
js/theme.js           six hues + light/dark/system + density (same as ModelLens Web)
js/router.js          hash router (ModelLens Web)
js/ui.js              toasts (aria-live), dialogs, 480px drawer, bottom sheet, popovers, tooltips, pills, switches, focus trap
js/charts.js          SVG ring gauge, sparkline, hourly columns
js/icons.js           ModelLens icon set + IRIS domain icons (16px, 1.5px stroke; no emoji)
js/util.js            h() element builder (text via textContent; href filtered to http(s)), formatters, safeHref, extLink
js/pages/*.js         one module per board: signin, mission, decisions, agents, revenue, projects, modellens, karta, estate,
                      markets, brain, intel, money, governance, settings (+ _common.js: loader with skeleton/empty/error)
js/fixtures/*.js      one sample payload per contract function, shaped exactly like the contract; mutable per-session state
js/vendor/supabase.js @supabase/supabase-js 2.115.0 UMD, vendored (sha256 f387e593…31dd5). It is not hosted on cdnjs under
                      any name, so it is served from this origin to keep the CSP at script-src 'self' + cdnjs.
```

## Configuration

`js/config.js` holds the only client-side configuration. The publishable key (`sb_publishable_…`) is public by design;
nothing else sensitive exists in the client. Everything privileged happens inside `SECURITY DEFINER` RPCs behind
`brain.require_owner()`.

External resources: Google Fonts (Inter, JetBrains Mono), Leaflet 1.9.4 from cdnjs (loaded lazily on the Estate page only),
OpenStreetMap tiles. All are listed in the CSP in `netlify.toml`.

## Preview mode

`?preview=1` in the URL, the **Preview with sample data** button on the sign-in screen, or the fallback buttons on the
"not an owner" / "auth unavailable" screens open the whole app on fixtures: no RPC calls, a persistent
"Preview · sample data" banner, a synthetic live-stream tick, and the Money page replaced by a "hidden in preview" card
(standing rule: public assets never show personal financials). Writes mutate in-memory state so approve/decline/switch
flows behave; state resets on reload. Exit with the banner button (returns to sign-in / the live session).

## Auth flow

1. `initSession()` — supabase-js restores the persisted session and consumes a magic-link redirect (`#access_token=…`).
2. Sign-in screen: email + password (`signInWithPassword`), "Create the owner account" (`signUp`, emailRedirectTo = origin),
   "Email me a magic link" (`signInWithOtp`, emailRedirectTo = origin).
3. After sign-in the app calls `iris2_me` → `{role: owner | member | none, scopes}`. Owners continue to `iris2_config_public`
   and the full app. Members (invited emails in `brain.member_emails`, today with the single scope `investing`) get the
   Investing tab and Settings, a member banner, and every other route resolves to `/markets`. `none` shows "This account
   isn't on the list" with Sign out / Check again / Preview. Any other failure (function not deployed, network) enters the
   app with a "Backend not reachable" banner and per-page error states with Retry.
4. Every page loads through `api.call`; 401/403 from any RPC drops an owner to the not-on-the-list screen (members are
   only ever routed to pages their scope allows). The owner manages members under Governance › Members.

## Contributing

`CONTRIBUTING.md` is the guide for outside contributors (Investing). The investing database layer is exported under
`supabase/investing/` (schema, functions, seed, local stubs) and the feeds under `workflows/investing/` (redacted n8n
exports). Internal owner notes under `docs/` are deliberately not versioned.

## Local development

```
python3 -m http.server 8790 --directory .
open http://localhost:8790/?preview=1#/mission
```

Verification scripts used for this build live in `/tmp/iris5_shots/` (Playwright): `run.py` screenshots every route in
preview (dark, light, 1024, 390) and drives the drawer, arm-to-approve, palette, theme popover and Tell IRIS;
`live_mode_test.py` exercises the non-preview code path (real supabase-js + PostgREST request path) against replayed
Supabase responses; `signin_test.py` renders the live sign-in screen.

## Deploy

```
cd /tmp/iris5_web
npx netlify-cli deploy --prod --dir . --site e24dc805-5ba8-4419-a79e-8c6bb4bae1ce
```
(or through the Netlify MCP `deploy-site` operation, which returns the exact command). `netlify.toml` carries the headers;
there is no build step. Deploy previews get the same CSP.

## Cutover checklist (owner)

1. **Backend**: confirm the RPC v2 migration is applied (`public.iris2_*` granted to `authenticated` only; the realtime
   trigger on `ops.agent_stream`; the `realtime.messages` policy `brain.is_owner(auth.uid())`).
2. **Supabase Auth → URL configuration**: add `https://iris-command-5.netlify.app` (and later the custom domain) to the
   Site URL / Redirect URLs so magic links and confirmation mails land back on the app.
3. **Allow-list**: make sure the owner email is in `brain.owner_emails` (first sign-in auto-enrols the uid into `brain.owners`).
4. **First sign-in**: open the site, use "Create the owner account" once (or a magic link), confirm the email, sign in.
   Mission must load without the red "Backend not reachable" banner; Governance › Audit log should show your first decision.
5. **Realtime**: on Agents the footer should read "Realtime connected"; "Polling every 30 s" means the private channel
   policy or the trigger is missing (the page still works).
6. **Repoint `iris-command`**: once satisfied, point the old site's domain (or a redirect) at `iris-command-5`, rotate the
   legacy board token from Governance › Machine tokens, and archive the v5 HUD.

## Contract notes (what the client assumes)

- `iris2_decisions` items: `detail.status` / `detail.execution_status` are read if present when the Mission page polls the
  inbox twice after an approval; absence is handled ("gone from the inbox" = executor picked it up).
- `iris2_estate`: the client reads `data.buy_box` plus `data.radar | data.pipeline | data.deals` for the requested view, with
  the field names of `iris_re_radar / iris_re_pipeline / iris_re_deals` (from the command-centre audit). Radar events have
  no `listing_id`, so "Underwrite" on a radar card calls `iris2_estate_action('intake', {…event fields})`; funnel rows use
  `promote {listing_id}`.
- `iris2_markets`: the client also reads an optional `feeds` object `{prices, catalysts, macro}` and
  `screen.thresholds` for the KPI subtitles; both are optional.
- `iris2_brain` claims carry an optional `at`; goals carry optional `progress_pct` / `horizon` / `next_milestone`.
- `iris2_money`: reads `summary` (or `fin_summary`) and `insights` (or `money_insights`) with the field names of
  `iris_fin_summary` / `iris_money_insights`.
- `iris2_modellens_run`: renders `run`, `findings[]`, `module_health[]`, `review`, `comparison` when present.
- Karta proposals (builder → SA) have no write RPC in the 5.0 contract; the queue is read-only with a note.
- `iris2_token_rotate` must never return the plaintext; the UI shows `vault_secret_name` only.
