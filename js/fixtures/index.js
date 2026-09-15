// Preview data: one entry per contract function in docs/IRIS5_RPC_CONTRACTS.md. Each returns the same {ok,data,meta} envelope
// the backend returns, so api.call() treats fixtures and PostgREST identically.
import { ok, STATE } from './_state.js';
import { mission, missionTower, missionAct } from './mission.js';
import { decisions, decideFx, decideBulkFx } from './decisions.js';
import { agents } from './agents.js';
import { stream } from './stream.js';
import { revenue, revChannelSet } from './revenue.js';
import { commerce, commerceOrder, commerceCustomerUpsert, commerceOrderCreate, commerceOrderAdvance, commercePaymentRecord, commerceFulfill, commerceEntitlementSet } from './commerce.js';
import { projects } from './projects.js';
import { modellens, modellensRun, modellensImportBundle } from './modellens.js';
import { karta, kartaTrace } from './karta.js';
import { estateDeals, estateSetAssumptions } from './estate.js';
import { investing, investingSecurity, positioning, positioningSignals } from './investing.js';
import { leads, lead, leadAct } from './leads.js';
import { studio, studioProduction, studioAct } from './studio.js';
import { careers, career, careerIntake, careerAct, careerFile } from './careers.js';
import { brain, brainAsk } from './brain.js';
import { intel } from './intel.js';
import { money } from './money.js';
import { autonomy, autonomySetPause, autonomyAgentSet, outboxRetry, outboxDeadletter } from './autonomy.js';
import { evolution, promptPromote, promptRollback } from './evolution.js';
import { governance, tokenRotate, tokenRevoke, securityUpdate, members, memberSet, memberRevoke, me } from './governance.js';
import { vault, vaultSetReadable, secretSet, secretClear } from './keys.js';
import { events } from './cortex.js';
import { traces, trace } from './traces.js';
import { dailyNotes } from './dailynotes.js';
import { station } from './station.js';

export const FIXTURES = {
  // reads
  iris2_mission: mission,
  iris2_mission_tower: missionTower,
  iris2_mission_act: missionAct,
  iris2_decisions: decisions,
  iris2_agents: agents,
  iris2_traces: traces,
  iris2_trace: trace,
  iris2_daily_notes: dailyNotes,
  iris2_station: station,
  iris2_me: me,
  iris2_members: members,
  iris2_member_set: memberSet,
  iris2_member_revoke: memberRevoke,
  iris2_stream: stream,
  iris2_revenue: revenue,
  iris2_commerce: commerce,
  iris2_commerce_order: commerceOrder,
  iris2_projects: projects,
  iris2_modellens: modellens,
  iris2_modellens_run: modellensRun,
  iris2_karta: karta,
  iris2_karta_trace: kartaTrace,
  iris2_estate_deals: estateDeals,
  iris2_investing: investing,
  iris2_investing_security: investingSecurity,
  iris2_positioning: positioning,
  iris2_positioning_signals: positioningSignals,
  iris2_leads: leads,
  iris2_lead: lead,
  iris2_lead_act: leadAct,
  iris2_studio: studio,
  iris2_studio_production: studioProduction,
  iris2_studio_act: studioAct,
  iris2_careers: careers,
  iris2_career: career,
  iris2_career_intake: careerIntake,
  iris2_career_act: careerAct,
  iris2_career_file: careerFile,
  iris2_brain: brain,
  iris2_brain_ask: brainAsk,
  iris2_intel: intel,
  iris2_money: money,
  iris2_governance: governance,
  iris2_autonomy: autonomy,
  iris2_evolution: evolution,
  iris2_vault: vault,
  iris2_events: events,
  iris2_config_public: () => ok({ realtime_channel: 'iris:stream', modellens_web_url: 'https://modellens.netlify.app', karta_web_url: null, version: '2.0' }),
  // writes
  iris2_decide: decideFx,
  iris2_decide_bulk: decideBulkFx,
  iris2_rev_channel_set: revChannelSet,
  iris2_commerce_customer_upsert: commerceCustomerUpsert,
  iris2_commerce_order_create: commerceOrderCreate,
  iris2_commerce_order_advance: commerceOrderAdvance,
  iris2_commerce_payment_record: commercePaymentRecord,
  iris2_commerce_fulfill: commerceFulfill,
  iris2_commerce_entitlement_set: commerceEntitlementSet,
  iris2_tell: (a) => { const id = `inbox_${Math.random().toString(16).slice(2, 10)}`; STATE.tells.push({ id, note: a.p_note, at: new Date().toISOString() }); return ok({ id, outbox_id: `obx_${Math.random().toString(16).slice(2, 10)}`, queued: true, subject: `[TO CLAUDE] ${String(a.p_note || '').slice(0, 60)}` }); },
  iris2_estate_set_assumptions: estateSetAssumptions,
  iris2_modellens_import_bundle: modellensImportBundle,
  iris2_token_rotate: tokenRotate,
  iris2_token_revoke: tokenRevoke,
  iris2_security_update: securityUpdate,
  iris2_autonomy_set_pause: autonomySetPause,
  iris2_autonomy_agent_set: autonomyAgentSet,
  iris2_outbox_retry: outboxRetry,
  iris2_outbox_deadletter: outboxDeadletter,
  iris2_prompt_promote: promptPromote,
  iris2_prompt_rollback: promptRollback,
  iris2_secret_set: secretSet,
  iris2_secret_clear: secretClear,
  iris2_vault_set_readable: vaultSetReadable,
};
