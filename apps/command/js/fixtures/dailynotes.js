// iris2_daily_notes(p_days) → { notes[], recent_kept[], triage{} }
//
// Shaped from the real pipeline on 2026-09-13/14, not an idealised one. The first Sonnet judge run
// kept 2 of 40; the drain over the 236-claim backlog kept 8 and discarded ~200. So the fixture shows:
//   · one note (yesterday), in the plain voice the writer is told to use — no headers, no hype
//   · a short recent_kept list where every item names the change it caused (the "Action:" half)
//   · counts where discards dwarf keeps, because that is what the rule produces on a scout feed
import { ok } from './_state.js';

const now = Date.now();
const iso = (secAgo) => new Date(now - secAgo * 1000).toISOString();
// notes are dated in the owner's day (America/New_York), like the real writer does
const ymd = (daysAgo) => { const d = new Date(new Date(now - daysAgo * 86400000).toLocaleString('en-US', { timeZone: 'America/New_York' })); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const NOTES = [
  {
    day: ymd(1),
    body: 'IRIS now knows two things it did not know on Friday. CMS has widened its anti-fraud push to DME suppliers, which calls for the RCM appeals agent to flag audit risk on DME-adjacent claims and recommend packaging documentation before submission, not only after a denial; that prompt change has not been made yet. The reviewer also kept a lesson from chief-of-staff: ten n8n workers do 98.6% of the agent work but are not registered, so spend caps and the pause switch do not cover them, and registering them is a decision for you. The two changes that actually ran yesterday were the approved EDGAR fundamentals backfill and the Cortex registry-coverage fix. Of 74 claims judged, 71 were industry news that left IRIS doing exactly what it did before and were discarded. Spend was $1.84.',
    kept: 3, discarded: 71, facts: 3, generated_at: iso(6 * 3600 + 1200), model: 'claude-sonnet-4-6',
  },
  {
    day: ymd(2),
    body: 'A quiet day. Thirty-eight claims were judged and none changed what IRIS does or knows — acquisitions, model launches and chip news. One approved proposal ran (the EDGAR fundamentals backfill) and the investing terminal now has quarterly fundamentals for the 61 tracked tickers. Spend was $2.10.',
    kept: 0, discarded: 38, facts: 0, generated_at: iso(30 * 3600 + 1200), model: 'claude-sonnet-4-6',
  },
];

const KEPT = [
  { id: 'e3b3690f-5758-4bba-8286-85dde4f2c8c8', kind: 'signal', agent: 'scout-craft', fact_id: 'f319d5da-86cf-4a34-9d52-309936291ab1', kept_at: iso(7 * 3600),
    statement: 'CMS puts more pressure on DME suppliers as part of anti-fraud push',
    why: 'CMS expanding anti-fraud enforcement on DME suppliers changes what the RCM appeals agent advises clients to prepare.',
    change: 'The RCM appeals agent’s prompt and checklist flag heightened CMS audit risk for DME-adjacent claims and recommend proactive documentation packaging before submission, not only on denial.' },
  { id: 'e83233bc-1cb4-458d-8f3a-dc2eced90308', kind: 'lesson', agent: 'chief-of-staff', fact_id: '023d4b37-bc38-4447-8303-c9c62ad9b18e', kept_at: iso(7 * 3600 + 40),
    statement: 'Ten n8n workers do 98.6% of IRIS’s observed agent work and are not in brain.agents',
    why: 'A measured lesson: 98.6% of agent work and 71% of spend is by agents not registered, so spend caps and the pause switch have no coverage over the highest-volume workers.',
    change: 'The builder adds universal-crawler, catalyst-feed, doc-digest, overseer, price-feed, earnings-actuals, earnings-estimates, prospecting-scout, harvester and modellens-review to brain.agents with rows in ops.spend_caps.' },
  { id: '26563b9e-9c92-4823-a1d9-6ada171a3782', kind: 'capability', agent: 'scout-craft', fact_id: 'ef2ad0d5-6419-4ec4-88ed-826d5c1f0035', kept_at: iso(7 * 3600 + 90),
    statement: 'anthropics/claude-code-action',
    why: 'An MIT-licensed official Anthropic GitHub Action that runs Claude Code review on every PR, replacing manual review today.',
    change: 'The builder adds claude-code-action to IRIS’s GitHub CI so any PR touching an n8n workflow or Supabase migration gets an automated Claude Code review before merge.' },
];

export function dailyNotes(args) {
  const days = Math.max(1, Math.min(60, Number(args?.p_days) || 7));
  return ok({
    notes: NOTES.slice(0, days),
    recent_kept: KEPT,
    triage: {
      pending: 41, kept_7d: 8, discarded_7d: 203, kept_today: 1, discarded_today: 37,
      last_run: iso(52 * 60), rule: 'keep only what changes what IRIS does or knows', next_note_at_local: '06:10 America/New_York',
    },
  });
}
