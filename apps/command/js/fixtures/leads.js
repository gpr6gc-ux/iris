// iris2_leads() + iris2_lead(p_id) + iris2_lead_act — sample data for preview mode.
// Mirrors the live shape from ops.leads + ops.lead_outreach (deterministic outreach engine).
import { ok } from './_state.js';

const L = [
  { id: 'lead-vei', org_name: 'Virginia Eye Institute', industry: 'Ophthalmology practice group', locality: 'Richmond, VA (9 sites)', employee_band: 'multi-site group', stage: 'qualified', confidence: 0.72, value_estimate: 29000, outreach_status: 'draft', angle: 'Front-door triage agent behind the single', website: 'https://www.vaeye.com',
    use_case: 'Front-door triage agent behind the single contact form and single phone line: classify each inbound as eyecare / hearing / aesthetics / billing / medical-records, route it to the owning site and department, draft the reply, and log it.',
    why_them: 'Nine locations plus an Aesthetics Center and a Hearing Center share ONE contact form and ONE phone line — every inbound is sorted by a human today.', found_by: 'Prospecting Scout' },
  { id: 'lead-krs', org_name: 'KRS Holdings', industry: 'Residential & commercial property management', locality: 'Richmond, VA HQ', employee_band: 'multi-office', stage: 'qualified', confidence: 0.70, value_estimate: 32000, outreach_status: 'ready', angle: 'Maintenance-request triage plus owner', website: 'https://www.krsholdings.com',
    use_case: 'Maintenance-request triage plus owner reporting: classify each request, route to the right vendor, and assemble the monthly owner statement automatically.',
    why_them: 'Their own About page states "KRS Holdings now manages over 5,000 properties" across six offices.', found_by: 'Prospecting Scout' },
  { id: 'lead-poolhouse', org_name: 'POOLHOUSE', industry: 'Political & Brand Advertising / Video', locality: 'Richmond, VA (HQ)', employee_band: '11–50', stage: 'candidate', confidence: 0.60, value_estimate: 39400, outreach_status: 'draft', angle: 'White-label video editing overflow and', website: 'https://poolhouse.com',
    use_case: 'White-label video editing overflow and n8n-driven content-production pipeline for peak campaign cycles.',
    why_them: 'Team page shows a small edit bench carrying a national political-ad workload — overflow spikes are structural.', found_by: 'Prospecting Scout' },
  { id: 'lead-sprocket', org_name: 'Sprocket Media Works', industry: 'Video & Animation Production', locality: 'Richmond, VA', employee_band: '2–9', stage: 'candidate', confidence: 0.75, value_estimate: 13000, outreach_status: 'draft', angle: 'White-label video editing overflow and', website: 'https://sprocketmediaworks.com',
    use_case: 'White-label video editing overflow and AI-assisted content production for a small shop that publicly advertises overflow capacity.',
    why_them: "The founder's own homepage states the business model in one line: \"The overflow partner for busy studios.\"", found_by: 'Prospecting Scout' },
  { id: 'lead-jra', org_name: 'James River Air Conditioning Company', industry: 'Commercial & residential HVAC / plumbing', locality: 'Richmond, VA', employee_band: '200+', stage: 'contacted', confidence: 0.55, value_estimate: 24000, outreach_status: 'sent', angle: 'Escalation triage and service-history', website: 'https://www.jamesriverair.com',
    use_case: 'Escalation triage and service-history retrieval: an agent that reads each inbound complaint, pulls equipment and visit history, classifies severity and warranty status, and hands the rep a drafted response.',
    why_them: 'A published "Customer Care Representative (Escalations)" role describes reconstructing each case by hand.', found_by: 'Prospecting Scout' },
];

const cardOf = (l) => ({
  id: l.id, org_name: l.org_name, industry: l.industry, locality: l.locality, employee_band: l.employee_band,
  stage: l.stage, confidence: l.confidence, value_estimate: l.value_estimate, website: l.website, source: 'scout',
  angle: l.angle, outreach_status: l.outreach_status, has_draft: true, next_action: null, next_action_due: null,
  last_touch_at: l.outreach_status === 'sent' ? '2026-09-05' : null, updated_at: '2026-09-06',
});

export const leads = () => ok({
  leads: L.map(cardOf),
  counts: { total: L.length, qualified: L.filter((x) => x.stage === 'qualified').length, candidate: L.filter((x) => x.stage === 'candidate').length, contacted: L.filter((x) => x.stage === 'contacted').length, pipeline_value: L.reduce((a, x) => a + (x.value_estimate || 0), 0) },
  outreach: { draft: L.filter((x) => x.outreach_status === 'draft').length, ready: L.filter((x) => x.outreach_status === 'ready').length, sent: L.filter((x) => x.outreach_status === 'sent').length },
  as_of: '2026-09-06T18:35:00Z',
  note: 'Prospects found by the IRIS scout; each has a drafted one-pager + outreach email. The engine drafts — you review and send. Evidence is from each prospect’s own site.',
});

const money = (v) => (v == null ? null : '$' + Number(v).toLocaleString('en-US'));
export const lead = (args) => {
  const id = args && (args.p_id || args.id);
  const l = L.find((x) => x.id === id) || L[0];
  const val = money(l.value_estimate);
  const body = `Hi ${l.org_name} team,\n\nI'm Greyson, founder of McCourtAI — an automation studio in Richmond, VA. We build AI agents that take repetitive operational work off your team, running on the systems you already use.\n\nI came across ${l.org_name} while researching ${l.industry} operations in ${l.locality}. The first workflow we'd focus on: ${l.use_case}\n\nIt goes live in weeks, not quarters, and runs on your current stack — no rip-and-replace. I'd rather show than tell: give me 15 minutes and I'll run a working demo on a workflow like yours — no slides, just the agent doing the job.\n\nOpen to a short call this week or next?\n\nBest,\nGreyson\nMcCourtAI · Richmond, VA\ngreyson@mccourtai.com`;
  return ok({
    id: l.id, org_name: l.org_name, industry: l.industry, locality: l.locality, employee_band: l.employee_band,
    stage: l.stage, confidence: l.confidence, value_estimate: l.value_estimate, website: l.website,
    source: 'scout', source_url: l.website, found_by: l.found_by, use_case: l.use_case, why_them: l.why_them,
    capabilities: ['automation', 'triage', 'intake', 'reporting'], created_at: '2026-08-28', last_touch_at: cardOf(l).last_touch_at,
    outreach: {
      status: l.outreach_status, angle: l.angle,
      email_subject: `A quick automation idea for ${l.org_name}`, email_body: body,
      one_pager: {
        headline: `${l.org_name} — ${l.use_case.slice(0, 58)}…`,
        meta: { industry: l.industry, locality: l.locality, size: l.employee_band, stage: l.stage, confidence: l.confidence, est_value: val, website: l.website },
        situation: l.why_them, opportunity: l.use_case,
        build: 'Automation surface: automation · triage · intake · reporting.',
        outcome: `Estimated engagement value ${val}. Runs on their existing stack; live in weeks, measurable from week one.`,
        talk_track: [`Open on their own words — the evidence above is from ${l.org_name}'s own site, not a guess.`, `Anchor on one workflow: ${l.angle}.`, 'Close on a 15-minute working demo, not a proposal.'],
        source_url: l.website, cta: 'Book a 15-minute working demo on a workflow like theirs.',
      },
      generated_at: '2026-09-06T18:35:00Z', sent_at: l.outreach_status === 'sent' ? '2026-09-05T14:00:00Z' : null,
    },
  });
};

// preview: acting just re-reads the same lead (no mutation in sample mode)
export const leadAct = (args) => lead(args);
